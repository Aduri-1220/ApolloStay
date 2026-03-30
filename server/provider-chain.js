const { parseMedicalText } = require("./local-parser");
const { localRecommendationPlan, localChooseMeals } = require("./recommendations");
const { isHuggingFaceEnabled, parseMedicalTextWithHuggingFace } = require("./huggingface");
const { parseMedicalTextWithOllama, chooseMealsWithOllama } = require("./ollama");
const {
  parseMedicalRecord: parseMedicalRecordWithOpenAI,
  createMealRecommendationPlan: createMealRecommendationPlanWithOpenAI,
  chooseMealRecommendations: chooseMealRecommendationsWithOpenAI
} = require("./openai");
const { hasMeaningfulMedicalData, buildLowConfidenceRecord } = require("./medical-utils");

function getProviderOrder() {
  const configured = process.env.AI_PROVIDER_ORDER;
  if (configured) {
    return configured.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return ["local", "huggingface", "ollama", "openai"];
}

function shouldUseProvider(name) {
  if (name === "huggingface") {
    return isHuggingFaceEnabled();
  }
  if (name === "ollama") {
    return process.env.ENABLE_OLLAMA !== "false";
  }
  if (name === "openai") {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  return true;
}

function isMeaningfulExtraction(parsed) {
  return hasMeaningfulMedicalData(parsed);
}

async function parseMedicalRecordWithFallback({ filename, mimeType, buffer, textContent, filePath }) {
  const order = getProviderOrder();
  const errors = [];
  const canUseTextProviders = Boolean(textContent && textContent.trim());

  for (const provider of order) {
    if (!shouldUseProvider(provider)) {
      continue;
    }

    try {
      if (provider === "local") {
        if (!canUseTextProviders) {
          throw new Error("Local parser needs extracted text. Upload a text-based file or enable a richer fallback.");
        }
        const parsed = parseMedicalText(textContent);
        if (!isMeaningfulExtraction(parsed)) {
          throw new Error("Local extraction quality was too low.");
        }
        return parsed;
      }
      if (provider === "huggingface") {
        const parsed = await parseMedicalTextWithHuggingFace({
          filename,
          mimeType,
          buffer,
          textContent,
          filePath
        });
        if (!isMeaningfulExtraction(parsed)) {
          throw new Error("Hugging Face extraction quality was too low.");
        }
        return parsed;
      }
      if (provider === "ollama") {
        if (!canUseTextProviders) {
          throw new Error("Ollama text parser needs extracted text. Scanned PDFs/images need OCR or OpenAI file parsing.");
        }
        const parsed = await parseMedicalTextWithOllama(textContent);
        if (!isMeaningfulExtraction(parsed)) {
          throw new Error("Ollama extraction quality was too low.");
        }
        return { provider: "ollama", confidence: 0.7, ...parsed };
      }
      if (provider === "openai") {
        const parsed = await parseMedicalRecordWithOpenAI({ filename, mimeType, buffer });
        return { provider: "openai", confidence: 0.85, ...parsed };
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  return buildLowConfidenceRecord({
    provider: "fallback",
    summary:
      `No parser provider succeeded. ${errors.join(" | ")}. PulsePilot tried local text extraction, macOS OCR, and Hugging Face free models first.`
  });
}

async function createRecommendationPlanWithFallback({ profile, medicalRecords, userPrompt, recentLogs }) {
  const order = getProviderOrder();
  const errors = [];

  for (const provider of order) {
    if (!shouldUseProvider(provider)) {
      continue;
    }

    try {
      if (provider === "local") {
        return localRecommendationPlan({ profile, medicalRecords, userPrompt, recentLogs });
      }
      if (provider === "ollama") {
        const plan = await choosePlanWithOllama({ profile, medicalRecords, userPrompt });
        return { provider: "ollama", ...plan };
      }
      if (provider === "openai") {
        const plan = await createMealRecommendationPlanWithOpenAI({ profile, medicalRecords, userPrompt });
        return { provider: "openai", ...plan };
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  throw new Error(`No recommendation-plan provider succeeded. ${errors.join(" | ")}`);
}

async function choosePlanWithOllama({ profile, medicalRecords, userPrompt }) {
  return {
    reasoningSummary: "Created by Ollama fallback.",
    searchQueries: localRecommendationPlan({ profile, medicalRecords, userPrompt }).searchQueries,
    avoidTerms: localRecommendationPlan({ profile, medicalRecords, userPrompt }).avoidTerms,
    nutritionPriorities: localRecommendationPlan({ profile, medicalRecords, userPrompt }).nutritionPriorities
  };
}

async function chooseMealsWithFallback({ profile, medicalRecords, userPrompt, candidates, plan }) {
  const order = getProviderOrder();
  const errors = [];

  for (const provider of order) {
    if (!shouldUseProvider(provider)) {
      continue;
    }

    try {
      if (provider === "local") {
        return localChooseMeals({ candidates, plan });
      }
      if (provider === "ollama") {
        const result = await chooseMealsWithOllama({ profile, medicalRecords, userPrompt, candidates });
        return { provider: "ollama", ...result };
      }
      if (provider === "openai") {
        const result = await chooseMealRecommendationsWithOpenAI({
          profile,
          medicalRecords,
          userPrompt,
          candidates
        });
        return { provider: "openai", ...result };
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  throw new Error(`No meal-recommendation provider succeeded. ${errors.join(" | ")}`);
}

module.exports = {
  parseMedicalRecordWithFallback,
  createRecommendationPlanWithFallback,
  chooseMealsWithFallback
};
