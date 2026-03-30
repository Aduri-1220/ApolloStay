const { InferenceClient } = require("@huggingface/inference");
const { normalizeWhitespace } = require("./medical-utils");

const NUMBER_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  quarter: 0.25
};

const UNIT_KEYWORDS = {
  bowl: "serving",
  bowls: "serving",
  plate: "serving",
  plates: "serving",
  cup: "cup",
  cups: "cup",
  glass: "cup",
  glasses: "cup",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  dosa: "piece",
  dosai: "piece",
  dose: "piece",
  idli: "piece",
  idlis: "piece",
  roti: "piece",
  rotis: "piece",
  chapati: "piece",
  chapatis: "piece"
};

const FILLER_WORDS = new Set([
  "i",
  "had",
  "have",
  "ate",
  "drank",
  "log",
  "logged",
  "add",
  "record",
  "track",
  "save",
  "my",
  "for",
  "the",
  "of",
  "please",
  "today"
]);

const SPEECH_CORRECTIONS = {
  dosai: "dosa",
  dose: "dosa",
  dosha: "dosa",
  chapathi: "chapati",
  cofee: "coffee",
  kaapi: "coffee",
  curdrice: "curd rice",
  sambarrice: "sambar rice",
  lemonrice: "lemon rice"
};

const GENERIC_FOOD_WORDS = new Set(["food", "meal", "item", "dish", "something"]);

function getHfToken() {
  return process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";
}

function getVoiceInferenceClient() {
  const token = getHfToken();
  if (!token) {
    throw new Error("HF_TOKEN or HUGGINGFACE_API_KEY is required for the free voice transcription stage.");
  }

  return new InferenceClient(token);
}

function normalizeTranscript(text) {
  return normalizeWhitespace(String(text || "").replace(/\s+/g, " ").replace(/[.?!]+$/g, "").trim());
}

function normalizeForParsing(text) {
  return normalizeTranscript(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applySpeechCorrections(text) {
  return normalizeForParsing(text)
    .split(" ")
    .map((word) => SPEECH_CORRECTIONS[word] || word)
    .join(" ");
}

function singularizeFoodTerm(text) {
  const value = String(text || "").trim();
  if (!value) {
    return value;
  }

  if (/ies$/i.test(value)) {
    return value.replace(/ies$/i, "y");
  }

  if (/(idlis|dosas|rotis|chapatis|eggs|bananas|apples)$/i.test(value)) {
    return value.replace(/s$/i, "");
  }

  return value;
}

function coerceNumber(token) {
  if (!token) {
    return null;
  }

  const normalized = String(token).toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, normalized)) {
    return NUMBER_WORDS[normalized];
  }

  const numeric = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function detectMealType(text) {
  if (/\bbreakfast\b|\bmorning\b/i.test(text)) {
    return "breakfast";
  }
  if (/\blunch\b/i.test(text)) {
    return "lunch";
  }
  if (/\bdinner\b/i.test(text)) {
    return "dinner";
  }
  if (/\bsnack\b|snacks|evening tea|tea time/i.test(text)) {
    return "snack";
  }
  return "breakfast";
}

function extractQuantityAndUnit(text) {
  const normalized = applySpeechCorrections(text);
  const patterns = [
    { regex: /\b(\d+(?:\.\d+)?)\s*(?:grams?|g)\b/i, unit: "g" },
    { regex: /\b(\d+(?:\.\d+)?)\s*(?:ml|milliliters?)\b/i, unit: "cup" },
    { regex: /\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|\d+(?:\.\d+)?)\s*(?:servings?)\b/i, unit: "serving" },
    { regex: /\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|\d+(?:\.\d+)?)\s*(?:cups?)\b/i, unit: "cup" },
    { regex: /\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|\d+(?:\.\d+)?)\s*(?:glasses?)\b/i, unit: "cup" },
    { regex: /\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|\d+(?:\.\d+)?)\s*(?:bowls?|plates?)\b/i, unit: "serving" },
    { regex: /\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|\d+(?:\.\d+)?)\s*(?:pieces?|pcs?)\b/i, unit: "piece" },
    {
      regex: /\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|\d+(?:\.\d+)?)\s*(idlis?|dosas?|rotis?|chapatis?|eggs?|bananas?|apples?)\b/i,
      unit: "piece"
    }
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) {
      continue;
    }

    const quantity = coerceNumber(match[1]);
    if (!quantity || quantity <= 0) {
      continue;
    }

    return {
      quantity,
      portionUnit: pattern.unit,
      matchedText: match[0],
      foodHint: match[2] || ""
    };
  }

  return {
    quantity: 1,
    portionUnit: "serving",
    matchedText: "",
    foodHint: ""
  };
}

function extractFoodQuery(text, mealType, matchedQuantityText, foodHint) {
  const normalized = applySpeechCorrections(text);
  const cleaned = normalized
    .split(" ")
    .filter((word) => {
      if (!word) {
        return false;
      }
      if (FILLER_WORDS.has(word)) {
        return false;
      }
      if (NUMBER_WORDS[word] !== undefined) {
        return false;
      }
      if (/^\d+(?:\.\d+)?$/.test(word)) {
        return false;
      }
      if (word === mealType) {
        return false;
      }
      if (UNIT_KEYWORDS[word]) {
        return false;
      }
      if (["and", "plus", "with"].includes(word)) {
        return false;
      }
      return true;
    })
    .join(" ")
    .replace(matchedQuantityText ? new RegExp(matchedQuantityText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : /$^/, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned) {
    return cleaned;
  }

  if (foodHint) {
    return foodHint;
  }

  return text;
}

function parseMealTranscriptLocally(transcript) {
  const normalized = applySpeechCorrections(transcript);
  const mealType = detectMealType(normalized);
  const quantityData = extractQuantityAndUnit(normalized);
  const foodQuery = extractFoodQuery(normalized, mealType, quantityData.matchedText, quantityData.foodHint);
  const cleanedFoodQuery = singularizeFoodTerm(foodQuery);
  const confidence = cleanedFoodQuery && cleanedFoodQuery.length >= 2 ? 0.82 : 0.45;

  return {
    transcript: normalized,
    spokenText: normalizeTranscript(transcript),
    parsed: {
      mealType,
      quantity: quantityData.quantity,
      portionUnit: quantityData.portionUnit,
      foodQuery: cleanedFoodQuery
    },
    confidence,
    needsReview: confidence < 0.85
  };
}

function splitTranscriptIntoMealItems(transcript) {
  const normalized = applySpeechCorrections(transcript);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s+(?:and then|and|plus)\s+|,/i)
    .map((item) => normalizeTranscript(item))
    .filter(Boolean);
}

function parseMultipleMealItems(transcript) {
  const items = splitTranscriptIntoMealItems(transcript).map((item) => parseMealTranscriptLocally(item));
  return items.length > 0 ? items : [parseMealTranscriptLocally(transcript)];
}

function buildVoiceSearchQueries(parsedItem) {
  const baseQuery = normalizeTranscript(parsedItem?.parsed?.foodQuery || "");
  const normalizedQuery = applySpeechCorrections(baseQuery);
  const tokens = normalizedQuery
    .split(" ")
    .map((token) => singularizeFoodTerm(token))
    .filter((token) => token && !GENERIC_FOOD_WORDS.has(token));

  const queries = new Set();
  if (baseQuery) {
    queries.add(baseQuery);
  }
  if (normalizedQuery) {
    queries.add(normalizedQuery);
  }
  if (tokens.length > 1) {
    queries.add(tokens.join(" "));
    queries.add(tokens.slice(-2).join(" "));
  }
  if (tokens.length > 0) {
    queries.add(tokens[tokens.length - 1]);
  }

  return Array.from(queries)
    .map((value) => normalizeTranscript(value))
    .filter((value) => value.length >= 2);
}

async function transcribeAudioWithHuggingFace({ buffer }) {
  const client = getVoiceInferenceClient();
  const response = await client.automaticSpeechRecognition({
    data: buffer,
    model: process.env.HUGGINGFACE_ASR_MODEL || "openai/whisper-large-v3",
    provider: process.env.HUGGINGFACE_PROVIDER || "auto"
  });

  const transcript = normalizeTranscript(response?.text || "");
  if (!transcript) {
    throw new Error("Hugging Face returned an empty transcript.");
  }

  return transcript;
}

module.exports = {
  applySpeechCorrections,
  buildVoiceSearchQueries,
  normalizeTranscript,
  parseMealTranscriptLocally,
  parseMultipleMealItems,
  transcribeAudioWithHuggingFace
};
