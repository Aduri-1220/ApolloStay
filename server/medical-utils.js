function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBoilerplateMedicalText(text) {
  const value = normalizeWhitespace(text).toLowerCase();
  if (!value) {
    return true;
  }

  return (
    /^%?pdf/.test(value) ||
    /\bphotoshop\b|\bacrobat\b|\badobe\b/.test(value) ||
    /^\[?page\s+\d+/.test(value) ||
    /^page\s+\d+\s+of\s+\d+/.test(value) ||
    /^barcode\b/.test(value) ||
    /from your previous/.test(value) ||
    /\bvisit(s)?\b/.test(value) ||
    /^tsmc\b/.test(value) ||
    /^record generated/.test(value) ||
    /^patient copy/.test(value) ||
    /^investigation your current visit/.test(value) ||
    /^biological reference interval/.test(value) ||
    /^clinical significance/.test(value) ||
    /^reference range/.test(value) ||
    /^method\b/.test(value) ||
    /^specimen\b/.test(value) ||
    /^sample\b/.test(value) ||
    /^hospital\b/.test(value) ||
    /^lab(oratory)?\b/.test(value) ||
    /\bmedplus\b/.test(value) ||
    /\bvaccin(e|ation)\b/.test(value) ||
    /\bbooster\b/.test(value) ||
    /\bmortality rate\b/.test(value) ||
    /\bapp store\b|\bgoogle play\b|\bclick here\b/.test(value) ||
    /\bfeedback and result queries\b/.test(value) ||
    /\bconditions of reporting\b/.test(value) ||
    /\bimportant disclaimer\b/.test(value) ||
    /\bmedplus id\b/.test(value) ||
    /^mrp\b/.test(value)
  );
}

const INVALID_OBSERVATION_PHRASES = [
  "d.no",
  "d.no.",
  "ph no",
  "phone",
  "narasaraopet",
  "chilakaluripet road",
  "panasathota",
  "mahatma gandhi",
  "mahathma gandhi",
  "medplus",
  "vaccinated population",
  "booster dose",
  "adults who ingest",
  "mortality rate",
  "click here",
  "google play",
  "app store",
  "feedback and result queries",
  "conditions of reporting",
  "important disclaimer",
  "medplus id",
  "explore more",
  "health trends",
  "my lab orders",
  "factory direct",
  "diagnostics - lab & radiology",
  "takes less than",
  "at medplus you can avail",
  "if already immunized",
  "age grp",
  "recommended only if titers are inadequate",
  "no booster needed",
  "annual dose",
  "no value mg/day",
  "chromatographic system",
  "fasting plasma glucose",
  "total area",
  "variant vo",
  "retention time",
  "calibration curve",
  "quality control",
  "control",
  "standard",
  "sample name",
  "sample type",
  "data acquired",
  "accuracy",
  "cal. point",
  "medplus health services limited",
  "opp idpl",
  "survey no",
  "hyderabad",
  "telangana",
  "wecare@",
  "director-lab services",
  "chief pathologist",
  "lab manager",
  "consultant pathologist",
  "verified by",
  "regd no",
  "critical limits",
  "good laboratory practice",
  "patient morbidity",
  "clinical utility",
  "clinical significance",
  "methodology",
  "calibration & quality control",
  "ms summary",
  "preliminary assessment"
];

const MEDICAL_NAME_HINTS = [
  "vitamin",
  "hemoglobin",
  "haemoglobin",
  "glucose",
  "cholesterol",
  "triglyceride",
  "ferritin",
  "iron",
  "urea",
  "bun",
  "creatinine",
  "bilirubin",
  "albumin",
  "cortisol",
  "c-peptide",
  "transferrin",
  "platelet",
  "rbc",
  "wbc",
  "mcv",
  "mch",
  "mchc",
  "rdw",
  "hematocrit",
  "haematocrit",
  "hba1c",
  "hba1",
  "hbf",
  "alkaline phosphatase",
  "alt",
  "ast",
  "calcium",
  "phosphorus",
  "sodium",
  "potassium",
  "hdl",
  "ldl",
  "tsh",
  "t3",
  "t4",
  "copper"
];

const KNOWN_LAB_ABBREVIATIONS = new Set([
  "HbA1c",
  "HbF",
  "Hb",
  "BUN",
  "LDL",
  "HDL",
  "TSH",
  "T3",
  "T4",
  "WBC",
  "RBC",
  "MCV",
  "MCH",
  "MCHC",
  "RDW",
  "ALT",
  "AST",
  "ALP",
  "UIBC",
  "TIBC",
  "SpO2"
]);

function cleanMedicalSummary(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !isBoilerplateMedicalText(line))
    .filter((line) => !/^date[:\s-]/i.test(line))
    .filter((line) => !/^(patient|name|id)[:\s-]/i.test(line));

  return lines[0] || "Imported medical record";
}

function isLikelyGarbageText(text) {
  const sample = String(text || "").slice(0, 500);
  if (!sample.trim()) {
    return true;
  }

  if (/^%PDF/i.test(sample) || /HPhotoshop|Acrobat|Adobe/i.test(sample)) {
    return true;
  }

  const alphaCount = (sample.match(/[A-Za-z]/g) || []).length;
  const punctuationCount = (sample.match(/[^A-Za-z0-9\s]/g) || []).length;
  return alphaCount === 0 || punctuationCount > alphaCount * 1.2;
}

function extractDate(text) {
  const matches = String(text || "").match(/\b(20\d{2}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})\b/);
  return matches ? matches[1] : null;
}

function splitList(text) {
  return sanitizeStringList(
    String(text || "")
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function sanitizeStringList(items) {
  const seen = new Set();
  const cleaned = [];

  for (const item of items || []) {
    const value = normalizeWhitespace(item);
    if (!value) {
      continue;
    }

    if (value.length < 2) {
      continue;
    }

    if (isBoilerplateMedicalText(value) || /current visit|previous visits/i.test(value)) {
      continue;
    }

    if (INVALID_OBSERVATION_PHRASES.some((phrase) => value.toLowerCase().includes(phrase))) {
      continue;
    }

    if (/^(?:parameter|units?|collection centre|report status|order|sample drawn|sample accepted|sample reported|name|contact|ref(?:erral)? doctor|sample type|data acquired|accuracy|cal\. point|stage)$/i.test(value)) {
      continue;
    }

    if (/\b(?:kinetic|traceable|molybdate|uricase|gpo pod|eclia|lcms ms|gl dh|gldh|calculated|nitroso psap|tptz|hexokinase|hplc|icpms|arsenazo|diazotization|cholesterol oxidase|peroxidase|immuno inhibition)\b/i.test(value)) {
      continue;
    }

    if (/critical limits|good laboratory practice|immediate health risk|patient morbidity|mortality|reporting units|reference ranges|limitations of technologies/i.test(value)) {
      continue;
    }

    if ((value.match(/[A-Za-z]/g) || []).length < 2) {
      continue;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push(value);
  }

  return cleaned;
}

function sanitizeDiagnosisList(items) {
  return sanitizeStringList(items).filter((value) => {
    const lowered = value.toLowerCase();
    if (
      /\bnormocytic\b|\bnormochromic\b|\bnormal study\b|\bnormal count\b|\bdifferential\b|\bmorphology\b|\bno parasite found\b|\badequate in number\b/.test(lowered)
    ) {
      return false;
    }
    if (
      /critical limits|good laboratory practice|immediate health risk|patient morbidity|mortality/.test(lowered)
    ) {
      return false;
    }
    return true;
  });
}

function sanitizeScalar(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = normalizeWhitespace(value);
  return trimmed || null;
}

function normalizeMedicalUnit(unit) {
  const value = sanitizeScalar(unit);
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  const mapping = {
    "mm hg": "mmHg",
    "millimeter of mercury": "mmHg",
    "mg/dl": "mg/dL",
    "mg dl": "mg/dL",
    "mmol/l": "mmol/L",
    "g/dl": "g/dL",
    "pg/ml": "pg/mL",
    "ng/ml": "ng/mL",
    "iu/l": "IU/L",
    "/cumm": "/cumm",
    "/hpf": "/HPF",
    "kgs": "kg",
    "kilograms": "kg",
    "grams": "g",
    "milligrams": "mg",
    "beats/min": "bpm"
  };

  return mapping[normalized] || value;
}

function normalizeMedicalName(name) {
  const value = normalizeWhitespace(name);
  if (!value) {
    return "";
  }

  const normalized = value.toLowerCase();
  const mapping = {
    bp: "Blood Pressure",
    "blood pressure": "Blood Pressure",
    pulse: "Heart Rate",
    "heart rate": "Heart Rate",
    glucose: "Blood Glucose",
    "blood glucose": "Blood Glucose",
    hba1c: "HbA1c",
    hba1: "HbA1c",
    hbale: "HbA1c",
    hb: "Hemoglobin",
    haemoglobin: "Hemoglobin",
    hemoglobin: "Hemoglobin",
    tsh: "TSH",
    t3: "T3",
    t4: "T4",
    wbc: "WBC",
    rbc: "RBC",
    ldl: "LDL",
    hdl: "HDL"
  };

  return mapping[normalized] || value;
}

function isPlausibleObservationName(name) {
  const value = normalizeWhitespace(name).toLowerCase();
  if (!value) {
    return false;
  }

  if (isBoilerplateMedicalText(value)) {
    return false;
  }

  if (INVALID_OBSERVATION_PHRASES.some((phrase) => value.includes(phrase))) {
    return false;
  }

  if (/^\d+$/.test(value)) {
    return false;
  }

  if (/^(?:d\.?no\.?|ph\.?\s*no|phone|name|contact|ref(?:erral)? doctor|collection centre|report status|order|sample drawn|sample accepted|sample reported)$/i.test(value)) {
    return false;
  }

  if (/^(?:sample type|data acquired|accuracy|cal\. point|stage|total area|methodology|clinical utility|clinical significance)$/i.test(value)) {
    return false;
  }

  if (/^[a-z]{1,3}\s*-?\s*\d+$/i.test(value)) {
    return false;
  }

  if (/^[a-z]{1,2}$/i.test(value)) {
    return false;
  }

  if (value.length > 64 && !MEDICAL_NAME_HINTS.some((hint) => value.includes(hint))) {
    return false;
  }

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 5 && !MEDICAL_NAME_HINTS.some((hint) => value.includes(hint))) {
    return false;
  }

  if (/\b(?:who|should|take|today|every|once|high|mins?|yrs?|male|female)\b/.test(value) && !MEDICAL_NAME_HINTS.some((hint) => value.includes(hint))) {
    return false;
  }

  if (/\b(?:kinetic|traceable|molybdate|uricase|gpo pod|eclia|lcms ms|hexokinase|hplc|icpms|arsenazo|diazotization|nitroso psap|tptz|calibration|quality control|variant|retention time)\b/.test(value)) {
    return false;
  }

  if (/^[a-z]+\s+(?:mol\/l|mg\/dl|ng\/ml|pg\/ml|g\/dl)\b/.test(value)) {
    return false;
  }

  return true;
}

function toNumericIfPossible(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.includes("/")) {
    return sanitizeScalar(value);
  }

  const match = String(value).match(/[<>]?\s*(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : sanitizeScalar(value);
}

function sanitizeObservationList(items, kind) {
  const seen = new Set();
  const cleaned = [];

  for (const item of items || []) {
    const name = normalizeMedicalName(item?.name);
    if (!name) {
      continue;
    }

    if (!isPlausibleObservationName(name) || /current visit|previous visits/i.test(name)) {
      continue;
    }

    if ((name.match(/[A-Za-z]/g) || []).length < 2) {
      continue;
    }

    const value = toNumericIfPossible(item?.value);
    const unit = normalizeMedicalUnit(item?.unit);
    const referenceRange = sanitizeScalar(item?.referenceRange);
    const interpretation = sanitizeScalar(item?.interpretation);
    const observedAt = sanitizeScalar(item?.observedAt);

    if (kind === "vital" && !/^(Blood Pressure|Heart Rate|Weight|Height|Temperature|SpO2)$/i.test(name)) {
      continue;
    }

    if (kind === "lab" && /^(Blood Pressure|Heart Rate|Weight|Height|Temperature|SpO2)$/i.test(name)) {
      continue;
    }

    if (kind === "lab") {
      const loweredName = name.toLowerCase();
      const hasMedicalHint = MEDICAL_NAME_HINTS.some((hint) => loweredName.includes(hint));
      const isKnownAbbreviation = KNOWN_LAB_ABBREVIATIONS.has(name);
      if (!hasMedicalHint && !isKnownAbbreviation) {
        continue;
      }
      if (unit === "." || unit === "-" || unit === "Name" || unit === "Collection Centre" || unit === "Dr Amar") {
        continue;
      }
      if (referenceRange && !/[\d<>]/.test(referenceRange)) {
        continue;
      }
      if (/^\d{6,}$/.test(String(value ?? "")) && !unit) {
        continue;
      }
    }

    if (referenceRange && INVALID_OBSERVATION_PHRASES.some((phrase) => referenceRange.toLowerCase().includes(phrase))) {
      continue;
    }

    const observation = kind === "lab"
      ? { name, value, unit, referenceRange, interpretation, observedAt }
      : { name, value, unit, observedAt };

    const key = `${name.toLowerCase()}::${value ?? ""}::${unit ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push(observation);
  }

  return cleaned.slice(0, 30);
}

function sanitizeMedicationContexts(items) {
  const seen = new Set();
  const cleaned = [];

  for (const item of items || []) {
    const originalName = sanitizeScalar(item?.originalName);
    const normalizedName = sanitizeScalar(item?.normalizedName) || originalName;
    const rxcui = sanitizeScalar(item?.rxcui);
    const source = sanitizeScalar(item?.source) || "local";
    const tags = sanitizeStringList(item?.tags || []);

    if (!originalName || isBoilerplateMedicalText(originalName)) {
      continue;
    }

    if (
      !sanitizeStringList([originalName]).length ||
      !isPlausibleObservationName(originalName)
    ) {
      continue;
    }

    const key = `${originalName.toLowerCase()}::${normalizedName?.toLowerCase() || ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push({
      originalName,
      normalizedName,
      rxcui,
      tags,
      source
    });
  }

  return cleaned.slice(0, 20);
}

function sanitizeMedicalRecord(record, options = {}) {
  const provider = options.provider || record?.provider || "local";
  const confidence = typeof options.confidence === "number"
    ? options.confidence
    : typeof record?.confidence === "number"
      ? record.confidence
      : 0.4;

  const summary = normalizeWhitespace(
    cleanMedicalSummary(
      record?.summary ||
        options.fallbackSummary ||
        "Imported medical record"
    )
  );

  return {
    provider,
    confidence,
    summary,
    recordDate: sanitizeScalar(record?.recordDate) || extractDate(summary),
    diagnoses: sanitizeDiagnosisList(record?.diagnoses || []),
    medications: sanitizeStringList(record?.medications || []),
    medicationContexts: sanitizeMedicationContexts(record?.medicationContexts || []),
    allergies: sanitizeStringList(record?.allergies || []),
    dietaryFlags: sanitizeStringList(record?.dietaryFlags || []),
    labResults: sanitizeObservationList(record?.labResults || [], "lab"),
    vitals: sanitizeObservationList(record?.vitals || [], "vital")
  };
}

function hasCoreMedicalData(record) {
  if (!record) {
    return false;
  }

  return Boolean(
    record.diagnoses?.length ||
      record.medications?.length ||
      record.allergies?.length ||
      record.labResults?.length ||
      record.vitals?.length
  );
}

function buildLowConfidenceRecord({ provider, summary }) {
  return sanitizeMedicalRecord(
    {
      summary:
        summary || "Low-confidence extraction. The uploaded document may be scanned, image-based, or poorly structured.",
      recordDate: null,
      diagnoses: [],
      medications: [],
      allergies: [],
      dietaryFlags: [],
      labResults: [],
      vitals: []
    },
    { provider, confidence: 0.1 }
  );
}

function hasMeaningfulMedicalData(record) {
  return hasCoreMedicalData(record);
}

function isLowConfidenceMedicalRecord(record) {
  if (!record) {
    return true;
  }

  if (hasMeaningfulMedicalData(record)) {
    return false;
  }

  return (
    typeof record.confidence === "number" && record.confidence < 0.3
  ) || /low-confidence|unable to reliably extract|parser fallback/i.test(String(record.summary || ""));
}

function getMedicalRecordStatus(record) {
  if (!record) {
    return "low_confidence";
  }

  if (isLowConfidenceMedicalRecord(record)) {
    return "low_confidence";
  }

  if (typeof record.confidence === "number" && record.confidence < 0.65) {
    return "needs_review";
  }

  return "parsed";
}

function mergeMedicalRecords(primary, secondary, options = {}) {
  const merged = sanitizeMedicalRecord(
    {
      summary: primary?.summary || secondary?.summary || options.fallbackSummary,
      recordDate: primary?.recordDate || secondary?.recordDate || null,
      diagnoses: [...(primary?.diagnoses || []), ...(secondary?.diagnoses || [])],
      medications: [...(primary?.medications || []), ...(secondary?.medications || [])],
      medicationContexts: [...(primary?.medicationContexts || []), ...(secondary?.medicationContexts || [])],
      allergies: [...(primary?.allergies || []), ...(secondary?.allergies || [])],
      dietaryFlags: [...(primary?.dietaryFlags || []), ...(secondary?.dietaryFlags || [])],
      labResults: [...(primary?.labResults || []), ...(secondary?.labResults || [])],
      vitals: [...(primary?.vitals || []), ...(secondary?.vitals || [])]
    },
    {
      provider: options.provider || primary?.provider || secondary?.provider || "local",
      confidence:
        typeof options.confidence === "number"
          ? options.confidence
          : Math.max(primary?.confidence || 0, secondary?.confidence || 0)
    }
  );

  if (!hasMeaningfulMedicalData(merged) && options.lowConfidenceSummary) {
    return buildLowConfidenceRecord({
      provider: merged.provider,
      summary: options.lowConfidenceSummary
    });
  }

  return merged;
}

module.exports = {
  normalizeWhitespace,
  normalizeLooseText,
  isBoilerplateMedicalText,
  cleanMedicalSummary,
  isLikelyGarbageText,
  extractDate,
  splitList,
  sanitizeStringList,
  sanitizeDiagnosisList,
  sanitizeScalar,
  normalizeMedicalUnit,
  normalizeMedicalName,
  isPlausibleObservationName,
  sanitizeObservationList,
  sanitizeMedicationContexts,
  sanitizeMedicalRecord,
  hasCoreMedicalData,
  buildLowConfidenceRecord,
  hasMeaningfulMedicalData,
  isLowConfidenceMedicalRecord,
  getMedicalRecordStatus,
  mergeMedicalRecords
};
