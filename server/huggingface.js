const { InferenceClient } = require("@huggingface/inference");
const { parseMedicalText } = require("./local-parser");
const { createOcrInputBuffer } = require("./ocr");
const {
  normalizeLooseText,
  isLikelyGarbageText,
  sanitizeMedicalRecord,
  buildLowConfidenceRecord,
  hasMeaningfulMedicalData,
  mergeMedicalRecords
} = require("./medical-utils");

function getHfToken() {
  return process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";
}

function isHuggingFaceEnabled() {
  return Boolean(getHfToken());
}

function getClient() {
  const token = getHfToken();
  if (!token) {
    throw new Error("HF_TOKEN or HUGGINGFACE_API_KEY is required for the Hugging Face parser stage.");
  }

  return new InferenceClient(token);
}

function extractChatText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part?.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");

    if (joined.trim()) {
      return joined.trim();
    }
  }

  throw new Error("Hugging Face chat response did not contain text output.");
}

function parseJsonFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Hugging Face response was empty.");
  }

  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeFenceMatch ? codeFenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error("Hugging Face response did not contain valid JSON.");
    }
    return JSON.parse(objectMatch[0]);
  }
}

async function extractTextWithHuggingFaceOcr({ mimeType, buffer, filePath }) {
  const imageBuffer = createOcrInputBuffer({ mimeType, buffer, filePath });
  if (!imageBuffer) {
    return null;
  }

  try {
    const client = getClient();
    const text = await client.imageToText({
      model: process.env.HUGGINGFACE_OCR_MODEL || "microsoft/trocr-base-printed",
      data: imageBuffer,
      provider: process.env.HUGGINGFACE_PROVIDER || "auto"
    });

    return normalizeLooseText(text);
  } catch {
    return null;
  }
}

async function structureMedicalTextWithHuggingFace(text) {
  const client = getClient();
  const response = await client.chatCompletion({
    model: process.env.HUGGINGFACE_MEDICAL_MODEL || "Qwen/Qwen2.5-7B-Instruct",
    provider: process.env.HUGGINGFACE_PROVIDER || "auto",
    messages: [
      {
        role: "system",
        content:
          "You extract medical values from reports. Return only valid JSON. Never invent values. If a field is missing, return null or an empty array."
      },
      {
        role: "user",
        content: [
          "Parse the medical text into this exact JSON shape:",
          '{"summary":"string","recordDate":"string|null","diagnoses":["string"],"medications":["string"],"allergies":["string"],"dietaryFlags":["string"],"labResults":[{"name":"string","value":"number|string|null","unit":"string|null","referenceRange":"string|null","interpretation":"string|null","observedAt":"string|null"}],"vitals":[{"name":"string","value":"number|string|null","unit":"string|null","observedAt":"string|null"}]}',
          "Keep exact lab names when possible.",
          "Only include clinically meaningful diagnoses, medications, allergies, dietary flags, lab results, and vitals.",
          "Medical text:",
          text.slice(0, 12000)
        ].join("\n")
      }
    ]
  });

  return parseJsonFromText(extractChatText(response));
}

async function parseMedicalTextWithHuggingFace({ filename, mimeType, buffer, textContent, filePath }) {
  let candidateText = normalizeLooseText(textContent || "");

  if (!candidateText || isLikelyGarbageText(candidateText)) {
    const ocrText = await extractTextWithHuggingFaceOcr({ mimeType, buffer, filePath });
    if (ocrText) {
      candidateText = ocrText;
    }
  }

  if (!candidateText) {
    throw new Error(`No text was available for Hugging Face extraction from ${filename}.`);
  }

  const localBaseline = parseMedicalText(candidateText);

  if (isLikelyGarbageText(candidateText) && !hasMeaningfulMedicalData(localBaseline)) {
    return buildLowConfidenceRecord({
      provider: "huggingface",
      summary: "Unable to reliably extract readable medical text from this document with the free parser stages."
    });
  }

  let merged = localBaseline;

  try {
    const structured = await structureMedicalTextWithHuggingFace(candidateText);
    const sanitized = sanitizeMedicalRecord(structured, {
      provider: "huggingface",
      confidence: 0.65,
      fallbackSummary: localBaseline.summary
    });

    merged = mergeMedicalRecords(sanitized, localBaseline, {
      provider: "huggingface",
      confidence: hasMeaningfulMedicalData(sanitized) ? 0.65 : 0.55,
      lowConfidenceSummary:
        "Low-confidence Hugging Face extraction. The uploaded document may still be too noisy for reliable value extraction."
    });
  } catch (error) {
    if (hasMeaningfulMedicalData(localBaseline)) {
      merged = sanitizeMedicalRecord(localBaseline, {
        provider: "huggingface",
        confidence: 0.5,
        fallbackSummary: localBaseline.summary
      });
    } else {
      return buildLowConfidenceRecord({
        provider: "huggingface",
        summary: `Unable to reliably extract structured medical values with Hugging Face for ${filename}.`
      });
    }
  }

  if (!hasMeaningfulMedicalData(merged)) {
    return buildLowConfidenceRecord({
      provider: "huggingface",
      summary:
        "Low-confidence Hugging Face extraction. The uploaded document may still be scanned, image-based, or too noisy."
    });
  }

  return merged;
}

module.exports = {
  isHuggingFaceEnabled,
  extractTextWithHuggingFaceOcr,
  parseMedicalTextWithHuggingFace
};
