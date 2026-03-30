const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { extractTextWithMacOcr, extractPdfTextWithMacOcr } = require("./ocr");
const { normalizeLooseText, isLikelyGarbageText } = require("./medical-utils");

const OPENAI_API_URL = "https://api.openai.com/v1";

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for medical record parsing and meal recommendations.");
  }

  return apiKey;
}

async function uploadUserFile({ filename, mimeType, buffer }) {
  const apiKey = getApiKey();
  const formData = new FormData();
  formData.append("purpose", "user_data");
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);

  const response = await fetch(`${OPENAI_API_URL}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`OpenAI file upload failed: ${await response.text()}`);
  }

  return response.json();
}

async function transcribeAudio({ filename, mimeType, buffer }) {
  const apiKey = getApiKey();
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  formData.append("model", process.env.OPENAI_AUDIO_TRANSCRIBE_MODEL || "whisper-1");
  formData.append("response_format", "json");

  const response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed: ${await response.text()}`);
  }

  const payload = await response.json();
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) {
    throw new Error("OpenAI transcription returned an empty transcript.");
  }

  return text;
}

function tryExtractPdfText(filePath, buffer) {
  try {
    if (filePath) {
      const output = execFileSync("strings", [filePath], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024
      });
      if (output.trim()) {
        return output;
      }
    }
  } catch {
    return null;
  }

  const fallback = buffer.toString("latin1");
  return fallback.includes("BT") ? fallback : null;
}

function mergeExtractedTexts(parts) {
  const seen = new Set();
  const merged = [];

  for (const part of parts) {
    const lines = normalizeLooseText(part || "").split(/\n/);
    for (const line of lines) {
      const normalized = line.trim();
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(normalized);
    }
  }

  return merged.join("\n").trim();
}

function extractTextContentDetailed({ mimeType, buffer, filePath }) {
  if (mimeType.startsWith("text/")) {
    return {
      text: normalizeLooseText(buffer.toString("utf8")),
      source: "native_text"
    };
  }

  if (mimeType === "application/pdf") {
    const extractedText = normalizeLooseText(tryExtractPdfText(filePath, buffer) || "");
    const ocrText = normalizeLooseText(extractPdfTextWithMacOcr(filePath) || "");
    if (extractedText && !isLikelyGarbageText(extractedText) && ocrText && !isLikelyGarbageText(ocrText)) {
      return {
        text: mergeExtractedTexts([extractedText, ocrText]),
        source: "native_text_plus_mac_ocr"
      };
    }
    if (extractedText && !isLikelyGarbageText(extractedText)) {
      return {
        text: extractedText,
        source: "native_text"
      };
    }
    if (ocrText) {
      return {
        text: ocrText,
        source: "mac_ocr"
      };
    }

    return {
      text: normalizeLooseText(extractTextWithMacOcr({ mimeType, filePath }) || ""),
      source: "mac_ocr_fallback"
    };
  }

  if (mimeType.startsWith("image/")) {
    return {
      text: normalizeLooseText(extractTextWithMacOcr({ mimeType, filePath }) || ""),
      source: "mac_ocr"
    };
  }

  return {
    text: null,
    source: "unsupported"
  };
}

function extractTextContentIfPossible(input) {
  return extractTextContentDetailed(input).text;
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const outputs = Array.isArray(payload.output) ? payload.output : [];
  for (const output of outputs) {
    const content = Array.isArray(output.content) ? output.content : [];
    for (const item of content) {
      if (typeof item.text === "string" && item.text.trim()) {
        return item.text;
      }
      if (item.type === "output_text" && typeof item.text === "string" && item.text.trim()) {
        return item.text;
      }
    }
  }

  throw new Error("OpenAI response did not contain text output.");
}

async function createStructuredResponse({ model, input, schemaName, schema, instructions }) {
  const apiKey = getApiKey();
  const response = await fetch(`${OPENAI_API_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input,
      instructions,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI response failed: ${await response.text()}`);
  }

  const payload = await response.json();
  const rawText = extractResponseText(payload);
  return JSON.parse(rawText);
}

async function parseMedicalRecord({ filename, mimeType, buffer }) {
  const file = await uploadUserFile({ filename, mimeType, buffer });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      recordDate: { type: ["string", "null"] },
      diagnoses: {
        type: "array",
        items: { type: "string" }
      },
      medications: {
        type: "array",
        items: { type: "string" }
      },
      allergies: {
        type: "array",
        items: { type: "string" }
      },
      dietaryFlags: {
        type: "array",
        items: { type: "string" }
      },
      labResults: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            value: { type: ["number", "string", "null"] },
            unit: { type: ["string", "null"] },
            referenceRange: { type: ["string", "null"] },
            interpretation: { type: ["string", "null"] },
            observedAt: { type: ["string", "null"] }
          },
          required: ["name", "value", "unit", "referenceRange", "interpretation", "observedAt"]
        }
      },
      vitals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            value: { type: ["number", "string", "null"] },
            unit: { type: ["string", "null"] },
            observedAt: { type: ["string", "null"] }
          },
          required: ["name", "value", "unit", "observedAt"]
        }
      }
    },
    required: ["summary", "recordDate", "diagnoses", "medications", "allergies", "dietaryFlags", "labResults", "vitals"]
  };

  return createStructuredResponse({
    model: process.env.OPENAI_MEDICAL_PARSER_MODEL || "gpt-4.1-mini",
    instructions:
      "Extract clinically relevant health information from the uploaded medical document. Do not invent missing values. Return null for unavailable fields and preserve exact lab names when possible.",
    input: [
      {
        role: "user",
        content: [
          { type: "input_file", file_id: file.id },
          {
            type: "input_text",
            text:
              "Parse this medical record and extract diagnoses, medications, allergies, dietary flags, vital signs, and lab values relevant to nutrition and meal planning."
          }
        ]
      }
    ],
    schemaName: "medical_record_extraction",
    schema
  });
}

async function createMealRecommendationPlan({ profile, medicalRecords, userPrompt }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      reasoningSummary: { type: "string" },
      searchQueries: {
        type: "array",
        minItems: 3,
        maxItems: 8,
        items: { type: "string" }
      },
      avoidTerms: {
        type: "array",
        items: { type: "string" }
      },
      nutritionPriorities: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["reasoningSummary", "searchQueries", "avoidTerms", "nutritionPriorities"]
  };

  return createStructuredResponse({
    model: process.env.OPENAI_RECOMMENDER_MODEL || "gpt-4.1-mini",
    instructions:
      "Create nutrition-aware search queries for meal recommendations. Base the plan on the provided profile and any parsed medical data if available. Avoid medical claims and do not invent diagnoses.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              profile,
              medicalRecords,
              userPrompt
            })
          }
        ]
      }
    ],
    schemaName: "meal_recommendation_search_plan",
    schema
  });
}

async function chooseMealRecommendations({ profile, medicalRecords, userPrompt, candidates }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      recommendations: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            foodId: { type: "string" },
            title: { type: "string" },
            whyItFits: { type: "string" },
            servingSuggestion: { type: "string" },
            cautions: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["foodId", "title", "whyItFits", "servingSuggestion", "cautions"]
        }
      }
    },
    required: ["summary", "recommendations"]
  };

  return createStructuredResponse({
    model: process.env.OPENAI_RECOMMENDER_MODEL || "gpt-4.1-mini",
    instructions:
      "Choose meal recommendations only from the provided food candidates. Use the user's profile and any parsed medical updates to explain why each recommendation fits. Do not invent nutrients or foods not present in the candidate list.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              profile,
              medicalRecords,
              userPrompt,
              candidates
            })
          }
        ]
      }
    ],
    schemaName: "meal_recommendations",
    schema
  });
}

async function analyzeMealImage({ filename, mimeType, buffer }) {
  const apiKey = getApiKey();
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      portionNote: { type: "string" },
      confidenceLabel: { type: "string" },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            estimatedPortion: { type: "string" },
            calories: { type: "number" },
            protein: { type: "number" },
            carbs: { type: "number" },
            fat: { type: "number" },
            confidence: { type: "string" }
          },
          required: ["name", "estimatedPortion", "calories", "protein", "carbs", "fat", "confidence"]
        }
      },
      totals: {
        type: "object",
        additionalProperties: false,
        properties: {
          calories: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" }
        },
        required: ["calories", "protein", "carbs", "fat"]
      }
    },
    required: ["title", "summary", "portionNote", "confidenceLabel", "items", "totals"]
  };

  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const response = await fetch(`${OPENAI_API_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Analyze this meal plate image for consumer nutrition logging. Identify likely foods, estimate a practical portion for each item, and return estimated calories, protein, carbs, and fat. Be conservative and label confidence honestly. Do not claim medical-grade accuracy."
            },
            {
              type: "input_image",
              image_url: dataUrl
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_scan_estimate",
          schema,
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI meal scan failed: ${await response.text()}`);
  }

  const payload = await response.json();
  const rawText = extractResponseText(payload);
  return JSON.parse(rawText);
}

module.exports = {
  parseMedicalRecord,
  createMealRecommendationPlan,
  chooseMealRecommendations,
  analyzeMealImage,
  transcribeAudio,
  extractTextContentIfPossible,
  extractTextContentDetailed
};
