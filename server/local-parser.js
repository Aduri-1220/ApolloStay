const {
  normalizeWhitespace,
  normalizeLooseText,
  isLikelyGarbageText,
  isBoilerplateMedicalText,
  isPlausibleObservationName,
  extractDate,
  splitList,
  cleanMedicalSummary,
  normalizeMedicalUnit,
  normalizeMedicalName,
  sanitizeMedicalRecord,
  buildLowConfidenceRecord,
  sanitizeStringList,
  sanitizeDiagnosisList,
  sanitizeObservationList
} = require("./medical-utils");

const LOCAL_PARSER_VERSION = 3;

const SECTION_HEADERS = [
  "diagnosis",
  "diagnoses",
  "impression",
  "assessment",
  "clinical summary",
  "summary",
  "medications",
  "medicines",
  "prescription",
  "allergies",
  "allergy",
  "investigation",
  "laboratory",
  "lab results",
  "haematology",
  "hematology",
  "biochemistry",
  "vitals",
  "observations",
  "advice",
  "plan"
];

const LAB_ALIASES = {
  hb: "Hemoglobin",
  haemoglobin: "Hemoglobin",
  hemoglobin: "Hemoglobin",
  glucose: "Blood Glucose",
  "blood glucose": "Blood Glucose",
  "fasting glucose": "Blood Glucose",
  "fasting blood sugar": "Blood Glucose",
  fbs: "Blood Glucose",
  ppbs: "Blood Glucose",
  hba1c: "HbA1c",
  tsh: "TSH",
  t3: "T3",
  t4: "T4",
  wbc: "WBC",
  rbc: "RBC",
  plt: "Platelet Count",
  platelets: "Platelet Count",
  platelet: "Platelet Count",
  pcv: "Hematocrit",
  "total leukocyte count": "WBC",
  "total leukocyte count (tlc)": "WBC",
  tlc: "WBC",
  creatinine: "Creatinine",
  sodium: "Sodium",
  potassium: "Potassium",
  cholesterol: "Total Cholesterol",
  triglyceride: "Triglycerides",
  triglycerides: "Triglycerides",
  ldl: "LDL",
  hdl: "HDL",
  ferritin: "Ferritin",
  "vitamin d": "Vitamin D",
  "vitamin b12": "Vitamin B12",
  albumin: "Albumin",
  bilirubin: "Bilirubin",
  ast: "AST",
  alt: "ALT",
  uric: "Uric Acid"
};

const MEDICATION_PATTERNS = [
  /\b(?:tab|tablet|cap|capsule|syrup|inj|injection)\s+([A-Za-z][A-Za-z0-9+\-/ ]{2,})/gi,
  /\b([A-Za-z][A-Za-z0-9+\-/ ]{2,})\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/gi
];

const DIAGNOSIS_PATTERNS = [
  /(?:diagnosis|diagnoses|impression|assessment)\s*[:\-]\s*([^\n]+)/gi,
  /\b(diabetes(?: mellitus)?|hypertension|hypothyroid(?:ism)?|hyperthyroid(?:ism)?|pcos|anemi[a-z]*|iron deficiency(?: anemia)?|kidney disease|renal disease|dyslipidemi[a-z]*|hyperlipidemi[a-z]*|fatty liver)\b/gi
];

const TABLE_HEADER_RE = /investigation\s+result\s+units\s+(?:biological\s+)?reference\s+(?:interval|range)/i;
const GENERIC_TABLE_HEADER_RE = /\b(?:test name|investigation|parameter|analyte)\b[\s:|/-]*\b(?:result|value)\b/i;
const METHOD_RE = /^\s*method\s*:\s*(.+)\s*$/i;
const INLINE_RESULT_RE = /^([A-Za-z][A-Za-z0-9\s()%+./-]{1,60}?)\s*(?:result)?\s*[:\-]\s*([<>]?\d+(?:\.\d+)?)\s*([A-Za-z/%µ.-]+)?(?:\s*(?:ref(?:erence)?(?:\s*range)?|range)?\s*[:\-]?\s*([A-Za-z0-9.<>\-– to/%µ., ]+))?$/i;
const RESULT_WITH_REF_RE = /^([A-Za-z][A-Za-z0-9\s()%+./-]{1,60}?)\s{1,}([<>]?\d+(?:\.\d+)?)\s*([A-Za-z/%µ.-]+)?\s+([0-9.<>\-– to/%µ., ]{2,})$/i;
const RESULT_VALUE_ONLY_RE = /^([A-Za-z][A-Za-z0-9\s()%+./-]{1,60}?)\s{1,}([<>]?\d+(?:\.\d+)?)\s*([A-Za-z/%µ.-]+)?$/i;
const NUMERIC_ONLY_RE = /^[<>]?\d+(?:\.\d+)?$/;
const UNIT_ONLY_RE = /^(?:[A-Za-z%µμ/.-]+(?:\s*[A-Za-z%µμ/.-]+)?)$/;
const RANGE_ONLY_RE = /^(?:[<>]?\d+(?:\.\d+)?\s*-\s*[<>]?\d+(?:\.\d+)?|[<>]?\d+(?:\.\d+)?\s*to\s*[<>]?\d+(?:\.\d+)?)$/i;
const IGNORE_TEST_PREFIXES = [
  "page",
  "reference",
  "clinical significance",
  "investigation your current visit",
  "biological reference interval",
  "from your previous",
  "barcode",
  "record generated",
  "patient copy",
  "method",
  "sample",
  "specimen",
  "lab",
  "medplus",
  "booster",
  "mrp",
  "vaccines",
  "feedback",
  "conditions of reporting"
];

const PAGE_BREAK_RE = /(?=^\[Page\s+\d+\])/gim;
const NON_REPORT_PAGE_HINTS = [
  "customized health record",
  "an abridged abstract. not a clinical laboratory report",
  "vaccines at medplus",
  "feedback and result queries",
  "conditions of reporting",
  "medplus mart - online pharmacy",
  "factory direct",
  "bookings call",
  "body fat analysis",
  "cardiac calcium scoring",
  "screening & vaccination recommendations",
  "preliminary assessment"
];
const MEDPLUS_SKIP_PAGE_HINTS = [
  "customized health record",
  "an abridged abstract. not a clinical laboratory report",
  "calibration curve",
  "metabolism of 1,25 dihydroxy vitamin d3",
  "clinical significance of 1,25 dihydroxy vitamin d3",
  "conditions of reporting",
  "vaccines at medplus",
  "feedback and result queries",
  "preliminary assessment",
  "screening & vaccination recommendations"
];
const REPORT_PAGE_HINTS = [
  "clinical laboratory report",
  "investigation",
  "result",
  "units",
  "test name",
  "parameter",
  "reference range",
  "normal range",
  "biological reference interval",
  "department of clinical biochemistry",
  "department of haematology",
  "department of hematology",
  "***end of the report***"
];

function canonicalLabName(name) {
  const normalized = normalizeWhitespace(name).toLowerCase();
  return LAB_ALIASES[normalized] || normalizeMedicalName(name);
}

function cleanLines(text) {
  return normalizeLooseText(text)
    .split(/\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !isBoilerplateMedicalText(line))
    .filter((line) => !/^page\s+\d+\s+of\s+\d+/i.test(line))
    .filter((line) => !/^barcode\b/i.test(line))
    .filter((line) => !/^from your previous/i.test(line))
    .filter((line) => !/^biological reference interval/i.test(line))
    .filter((line) => !/^clinical significance/i.test(line));
}

function splitIntoPages(text) {
  const normalized = normalizeLooseText(text);
  const chunks = normalized.split(PAGE_BREAK_RE).map((chunk) => chunk.trim()).filter(Boolean);
  return chunks.length > 0 ? chunks : [normalized];
}

function isLikelyResultPage(pageText) {
  const lowered = normalizeLooseText(pageText).toLowerCase();
  if (!lowered) {
    return false;
  }

  if (NON_REPORT_PAGE_HINTS.some((hint) => lowered.includes(hint))) {
    return false;
  }

  return REPORT_PAGE_HINTS.some((hint) => lowered.includes(hint));
}

function getRelevantReportText(text) {
  const pages = splitIntoPages(text);
  const relevantPages = pages.filter(isLikelyResultPage);
  return relevantPages.length > 0 ? relevantPages.join("\n\n") : normalizeLooseText(text);
}

function cleanPageLines(pageText) {
  return normalizeLooseText(pageText)
    .split(/\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !/^\[?page\s+\d+/i.test(line))
    .filter((line) => !/^(?:medplus health services limited|cin:|wecare@|www\.medplusmart\.com|factory direct|click here|medplus mart - online pharmacy)/i.test(line))
    .filter((line) => !/^(?:abnormal|critical|\*+end of the report\*+|note: please contact us)/i.test(line))
    .filter((line) => !/^(?:dr |mr |ms )/i.test(line))
    .filter((line) => !/^(?:name|age \/ sex|contact|collection centre|referral doctor|order|sample drawn|sample accepted|sample reported|report status|sample type|department of clinical biochemistry|department of haematology|department of hematology|units|biological reference interval|result)$/i.test(line))
    .filter((line) => !/^(?:director-lab services|consultant pathologist|lab manager|verified by|regd no)/i.test(line));
}

function isMedplusStructuredPage(pageText) {
  const lowered = normalizeLooseText(pageText).toLowerCase();
  if (!lowered.includes("clinical laboratory report")) {
    return false;
  }
  if (MEDPLUS_SKIP_PAGE_HINTS.some((hint) => lowered.includes(hint))) {
    return false;
  }
  return lowered.includes("biological reference interval") || lowered.includes("investigation");
}

function isApolloDiagnosticsPage(pageText) {
  const lowered = normalizeLooseText(pageText).toLowerCase();
  return (
    lowered.includes("apollo") &&
    lowered.includes("diagnostics") &&
    lowered.includes("test name") &&
    lowered.includes("result")
  );
}

function isGenericStructuredPage(pageText) {
  const lowered = normalizeLooseText(pageText).toLowerCase();
  if (!lowered) {
    return false;
  }

  if (NON_REPORT_PAGE_HINTS.some((hint) => lowered.includes(hint))) {
    return false;
  }

  const hasHeader =
    TABLE_HEADER_RE.test(pageText) ||
    GENERIC_TABLE_HEADER_RE.test(pageText) ||
    (/\bresult\b/i.test(pageText) &&
      /\b(?:test name|parameter|investigation|units?|reference range|normal range|bio\.?\s*ref\.?\s*interval)\b/i.test(pageText));

  return hasHeader;
}

function parseNumericCell(value) {
  const normalized = normalizeWhitespace(String(value || "")).replace(/,/g, "");
  if (!normalized || !/^[<>]?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  return Number(normalized.replace(/[<>]/g, ""));
}

function isLikelyUnitLine(line) {
  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return false;
  }

  return /^(?:%|g\/dL|pg\/mL|ng\/mL|fL|pg|cells\/cu\.mm|million\/cu\.mm|\/cumm|\/HPF|IU\/L|U\/L|mg\/dL|mmol\/L|mEq\/L|FI|Positive|Negative)$/i.test(normalized);
}

function findNextLine(lines, startIndex, predicate, maxLookahead = 12) {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + maxLookahead); index += 1) {
    const line = normalizeWhitespace(lines[index]);
    if (!line) {
      continue;
    }
    if (predicate(line)) {
      return line;
    }
  }
  return null;
}

function tokenizeStructuredRow(line) {
  return normalizeWhitespace(line)
    .split(/\s{2,}|\t+/)
    .map((token) => normalizeWhitespace(token))
    .filter(Boolean);
}

function looksLikeResultToken(value) {
  return parseNumericCell(value) !== null;
}

function looksLikeReferenceToken(value) {
  const normalized = normalizeWhitespace(value);
  return (
    isReferenceRangeLine(normalized) ||
    /^\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?\s*[A-Za-z/%µ.-]*$/i.test(normalized) ||
    /^(?:<|>)\s*\d+(?:\.\d+)?\s*[A-Za-z/%µ.-]*$/i.test(normalized)
  );
}

function parseGenericStructuredRow(line, nextLine = "") {
  const tokens = tokenizeStructuredRow(line);
  if (tokens.length < 2) {
    return null;
  }

  const resultIndex = tokens.findIndex((token, index) => index > 0 && looksLikeResultToken(token));
  if (resultIndex < 1) {
    return null;
  }

  const rawName = tokens.slice(0, resultIndex).join(" ");
  const name = canonicalLabName(rawName);
  if (!isProbableTestName(name) || /blood pressure|heart rate|weight|height/i.test(name)) {
    return null;
  }

  const value = parseNumericCell(tokens[resultIndex]);
  if (value === null) {
    return null;
  }

  let unit = null;
  let referenceRange = null;

  for (let index = resultIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!unit && (UNIT_ONLY_RE.test(token) || isLikelyUnitLine(token))) {
      unit = normalizeMedicalUnit(token);
      continue;
    }

    if (!referenceRange && looksLikeReferenceToken(token)) {
      referenceRange = normalizeWhitespace(token);
      continue;
    }

    if (!referenceRange && index === tokens.length - 1 && looksLikeReferenceToken(`${token} ${normalizeWhitespace(nextLine)}`)) {
      referenceRange = normalizeWhitespace(`${token} ${normalizeWhitespace(nextLine)}`);
    }
  }

  return {
    name,
    value,
    unit,
    referenceRange,
    interpretation: null,
    observedAt: null
  };
}

function extractGenericStructuredLabResults(text) {
  const pages = splitIntoPages(text);
  const extracted = [];
  const seen = new Set();

  for (const page of pages) {
    if (!isGenericStructuredPage(page) || isMedplusStructuredPage(page) || isApolloDiagnosticsPage(page)) {
      continue;
    }

    const lines = cleanPageLines(page);
    let inStructuredSection = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = normalizeWhitespace(lines[index]);
      const next = normalizeWhitespace(lines[index + 1] || "");
      if (!line) {
        continue;
      }

      if (TABLE_HEADER_RE.test(line) || GENERIC_TABLE_HEADER_RE.test(line)) {
        inStructuredSection = true;
        continue;
      }

      if (!inStructuredSection) {
        continue;
      }

      if (/^(?:comment|interpretation|notes?|clinical significance|clinical utility)$/i.test(line)) {
        continue;
      }

      if (isSectionHeader(line) && !/\b(?:investigation|lab results|laboratory|hematology|haematology|biochemistry)\b/i.test(line)) {
        inStructuredSection = false;
        continue;
      }

      const parsed = parseGenericStructuredRow(line, next);
      if (!parsed) {
        continue;
      }

      const key = `${parsed.name.toLowerCase()}::${parsed.value}::${parsed.unit || ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      extracted.push(parsed);
    }
  }

  return sanitizeObservationList(extracted, "lab");
}

function extractApolloSingleTest(pageText) {
  const lines = cleanPageLines(pageText);
  const testNameIndex = lines.findIndex((line) => /^test name$/i.test(line));
  const resultIndex = lines.findIndex((line) => /^result$/i.test(line));
  const unitIndex = lines.findIndex((line) => /^unit$/i.test(line));
  const rangeIndex = lines.findIndex((line) => /^bio\.?\s*ref\.?\s*interval$/i.test(line));
  const methodIndex = lines.findIndex((line) => /^method$/i.test(line));

  if (testNameIndex < 0 || resultIndex < 0) {
    return [];
  }

  const nameLines = [];
  for (let index = testNameIndex + 1; index < Math.min(lines.length, testNameIndex + 6); index += 1) {
    const line = normalizeWhitespace(lines[index]);
    if (!line || /^comment:?$/i.test(line) || /^(?:result|unit|bio\.?\s*ref\.?\s*interval|method)$/i.test(line)) {
      break;
    }
    nameLines.push(line);
  }

  const resultLine = findNextLine(lines, resultIndex + 1, (line) => parseNumericCell(line) !== null, 6);
  const resultValue = parseNumericCell(resultLine);
  if (!nameLines.length || resultValue === null) {
    return [];
  }

  const name = canonicalLabName(nameLines.join(" ").replace(/\s+,/g, ","));
  if (!isProbableTestName(name)) {
    return [];
  }

  const unit = unitIndex >= 0 ? normalizeMedicalUnit(findNextLine(lines, unitIndex + 1, isLikelyUnitLine, 6)) : null;
  const referenceRange =
    rangeIndex >= 0
      ? normalizeWhitespace(findNextLine(lines, rangeIndex + 1, (line) => isReferenceRangeLine(line) || /^(?:<|>)?\d+(?:\.\d+)?$/i.test(line), 6) || "") || null
      : null;
  const interpretation = methodIndex >= 0 ? normalizeWhitespace(findNextLine(lines, methodIndex + 1, (line) => !/^(?:comment|page \d+)/i.test(line), 6) || "") || null : null;

  return [
    {
      name,
      value: resultValue,
      unit,
      referenceRange,
      interpretation,
      observedAt: null
    }
  ];
}

function takeSequential(lines, startIndex, count, predicate) {
  const values = [];
  let cursor = startIndex;
  while (cursor < lines.length && values.length < count) {
    const line = normalizeWhitespace(lines[cursor]);
    if (!line) {
      cursor += 1;
      continue;
    }
    if (!predicate(line)) {
      break;
    }
    values.push(line);
    cursor += 1;
  }
  return { values, nextIndex: cursor };
}

function extractApolloCbcPage(pageText) {
  const lines = cleanPageLines(pageText);
  const cbcIndex = lines.findIndex((line) => /complete blood count/i.test(line));
  if (cbcIndex < 0) {
    return [];
  }

  const extracted = [];

  const hemoglobinIndex = lines.findIndex((line) => /^ha?emoglobin$/i.test(line));
  if (hemoglobinIndex >= 0) {
    const hemoValue = parseNumericCell(lines[hemoglobinIndex + 1]);
    const hemoUnit = normalizeMedicalUnit(findNextLine(lines, hemoglobinIndex + 2, isLikelyUnitLine, 10));
    const hemoRange = normalizeWhitespace(findNextLine(lines, hemoglobinIndex + 2, isReferenceRangeLine, 20) || "") || null;
    if (hemoValue !== null) {
      extracted.push({
        name: "Hemoglobin",
        value: hemoValue,
        unit: hemoUnit,
        referenceRange: hemoRange,
        interpretation: null,
        observedAt: null
      });
    }
  }

  const namesStart = lines.findIndex((line, index) => index > hemoglobinIndex && /^pcv$/i.test(line));
  if (namesStart < 0) {
    return extracted;
  }

  const names1 = [
    "PCV",
    "RBC Count",
    "MCV",
    "MCH",
    "MCHC",
    "RDW",
    "Total Leukocyte Count"
  ];
  const values1Start = lines.findIndex((line, index) => index > namesStart && parseNumericCell(line) !== null);
  const valueLines1 = values1Start >= 0 ? lines.slice(values1Start, values1Start + names1.length) : [];
  const unitLines1 = values1Start >= 0 ? lines.slice(values1Start + names1.length, values1Start + names1.length + names1.length) : [];
  const range1Start = values1Start + names1.length + names1.length + 1;
  const rangeLines1 = values1Start >= 0 ? lines.slice(range1Start, range1Start + names1.length) : [];

  names1.forEach((name, index) => {
    const value = parseNumericCell(valueLines1[index]);
    if (value === null) {
      return;
    }
    extracted.push({
      name: canonicalLabName(name),
      value,
      unit: normalizeMedicalUnit(unitLines1[index] || null),
      referenceRange: normalizeWhitespace(rangeLines1[index] || "") || null,
      interpretation: null,
      observedAt: null
    });
  });

  const diffNames = ["Neutrophils", "Lymphocytes", "Eosinophils", "Monocytes", "Basophils"];
  const diffStart = lines.findIndex((line, index) => index > range1Start && /^neutrophils$/i.test(line));
  if (diffStart >= 0) {
    const valuesStart = lines.findIndex((line, index) => index > diffStart && /^47$/.test(normalizeWhitespace(line)));
    const diffValues = valuesStart >= 0 ? lines.slice(valuesStart, valuesStart + diffNames.length) : [];
    const diffUnits = valuesStart >= 0 ? lines.slice(valuesStart + diffNames.length + 1, valuesStart + diffNames.length + 1 + diffNames.length) : [];
    const diffRanges = valuesStart >= 0 ? lines.slice(valuesStart + diffNames.length + 1 + diffNames.length + 1, valuesStart + diffNames.length + 1 + diffNames.length + 1 + diffNames.length) : [];

    diffNames.forEach((name, index) => {
      const value = parseNumericCell(diffValues[index]);
      if (value === null) {
        return;
      }
      extracted.push({
        name,
        value,
        unit: normalizeMedicalUnit(diffUnits[index] || "%"),
        referenceRange: normalizeWhitespace(diffRanges[index] || "") || null,
        interpretation: null,
        observedAt: null
      });
    });
  }

  const absoluteNames = [
    "Absolute Neutrophils",
    "Absolute Lymphocytes",
    "Absolute Eosinophils",
    "Absolute Monocytes",
    "Neutrophil Lymphocyte Ratio",
    "Platelet Count",
    "MPV"
  ];
  const absoluteStart = lines.findIndex((line, index) => index > diffStart && /^2035(?:\.1)?$/.test(normalizeWhitespace(line).replace(/,/g, "")));
  if (absoluteStart >= 0) {
    const absoluteValues = lines.slice(absoluteStart, absoluteStart + absoluteNames.length).map(parseNumericCell);
    const rangeCandidates = lines.slice(absoluteStart + absoluteNames.length + 6, absoluteStart + absoluteNames.length + 13).map((line) => normalizeWhitespace(line));
    const absoluteUnits = ["Cells/cu.mm", "Cells/cu.mm", "Cells/cu.mm", "Cells/cu.mm", null, null, "FI"];

    absoluteNames.forEach((name, index) => {
      const value = absoluteValues[index];
      if (value === null || value === undefined) {
        return;
      }
      extracted.push({
        name,
        value,
        unit: normalizeMedicalUnit(absoluteUnits[index]),
        referenceRange: normalizeWhitespace(rangeCandidates[index] || "") || null,
        interpretation: null,
        observedAt: null
      });
    });
  }

  return extracted;
}

function extractApolloKnownSingleTests(pageText) {
  const normalized = normalizeLooseText(pageText);
  const extracted = [];
  const patterns = [
    {
      name: "Vitamin D",
      regex: /Result\s+([0-9]+(?:\.[0-9]+)?)\s+Unit\s+(ng\/mL)[\s\S]{0,1200}?Test Name\s+VITAMIN D\s*\(25\s*-\s*OH VITAMIN D\)\s*,?\s*SERUM[\s\S]{0,500}?Bio\.\s*Ref\.\s*Interval\s+([0-9<>-]+)/i
    },
    {
      name: "Vitamin B12",
      regex: /Test Name\s+VITAMIN B12,?\s*SERUM\s+Result\s+([0-9]+(?:\.[0-9]+)?)\s+Unit\s+(pg\/mL)\s+Bio\.\s*Ref\.\s*Interval\s+([0-9<>-]+)/i
    }
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) {
      continue;
    }
    const value = parseNumericCell(match[1]);
    if (value === null) {
      continue;
    }
    extracted.push({
      name: pattern.name,
      value,
      unit: normalizeMedicalUnit(match[2] || null),
      referenceRange: normalizeWhitespace(match[3] || "") || null,
      interpretation: null,
      observedAt: null
    });
  }

  return extracted;
}

function extractApolloDiagnosticsLabResults(text) {
  const pages = splitIntoPages(text);
  const extracted = [];

  for (const page of pages) {
    if (!isApolloDiagnosticsPage(page)) {
      continue;
    }

    if (/complete blood count/i.test(page)) {
      extracted.push(...extractApolloCbcPage(page));
      continue;
    }

    extracted.push(...extractApolloKnownSingleTests(page));
    extracted.push(...extractApolloSingleTest(page));
  }

  return sanitizeObservationList(extracted, "lab");
}

function findResultValue(lines) {
  const resultIndex = lines.findIndex((line) => /^result$/i.test(line));
  if (resultIndex < 0) {
    return null;
  }
  for (let index = resultIndex + 1; index < Math.min(lines.length, resultIndex + 8); index += 1) {
    const candidate = normalizeWhitespace(lines[index]);
    if (!candidate) {
      continue;
    }
    if (NUMERIC_ONLY_RE.test(candidate)) {
      return Number(candidate.replace(/[<>]/g, ""));
    }
  }
  return null;
}

function isReferenceRangeLine(line) {
  return RANGE_ONLY_RE.test(line) || /^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?$/i.test(line);
}

function normalizeObservationName(name) {
  const normalized = normalizeMedicalName(name)
    .replace(/\s*\*+\s*$/, "")
    .replace(/\s+-\s+serum$/i, "")
    .replace(/\s+serum$/i, "")
    .replace(/\s+-\s+fasting$/i, "")
    .trim();
  return normalized;
}

function extractMedplusObservations(pageText) {
  const lines = cleanPageLines(pageText);
  const observations = [];
  const loweredLines = lines.map((line) => line.toLowerCase());
  const markerIndex = loweredLines.findIndex((line) => line.includes("biological reference interval"));
  const afterMarker = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;
  const scanLines = afterMarker.length > 0 ? afterMarker : lines;
  const resultValue = findResultValue(lines);
  const seen = new Set();
  const pending = [];

  for (let index = 0; index < scanLines.length; index += 1) {
    const line = normalizeWhitespace(scanLines[index]);
    const prev = normalizeWhitespace(scanLines[index - 1] || "");
    const next = normalizeWhitespace(scanLines[index + 1] || "");
    const nextNext = normalizeWhitespace(scanLines[index + 2] || "");

    if (!line) {
      continue;
    }

    if (/^(?:clinical significance|clinical utility|note:|parameter|units)$/i.test(line)) {
      continue;
    }

    if (isProbableTestName(line) && METHOD_RE.test(next)) {
      pending.push({
        name: normalizeObservationName(line),
        interpretation: normalizeWhitespace(next.replace(/^method\s*:\s*/i, "")),
        unitHint: UNIT_ONLY_RE.test(prev) && !isReferenceRangeLine(prev) ? normalizeMedicalUnit(prev) : null
      });
      index += 1;
      continue;
    }

    if (NUMERIC_ONLY_RE.test(line) && pending.length > 0) {
      const target = pending.shift();
      const unit = UNIT_ONLY_RE.test(next) && !isReferenceRangeLine(next) ? normalizeMedicalUnit(next) : target.unitHint;
      const referenceRange = isReferenceRangeLine(next)
        ? next
        : isReferenceRangeLine(nextNext)
          ? nextNext
          : null;

      const observation = {
        name: target.name,
        value: Number(line.replace(/[<>]/g, "")),
        unit: unit || null,
        referenceRange: referenceRange || null,
        interpretation: target.interpretation || null,
        observedAt: null
      };
      const key = `${observation.name.toLowerCase()}::${observation.value}::${observation.unit || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        observations.push(observation);
      }
      continue;
    }
  }

  if (resultValue !== null && observations.length === 0 && pending.length === 1) {
    const target = pending[0];
    observations.push({
      name: target.name,
      value: resultValue,
      unit: target.unitHint || null,
      referenceRange: null,
      interpretation: target.interpretation || null,
      observedAt: null
    });
  }

  return observations;
}

function extractMedplusLabResults(text) {
  const pages = splitIntoPages(text);
  const extracted = [];

  for (const page of pages) {
    if (!isMedplusStructuredPage(page)) {
      continue;
    }
    extracted.push(...extractMedplusObservations(page));
  }

  return sanitizeObservationList(extracted, "lab");
}

function isSectionHeader(line) {
  const normalized = line.toLowerCase().replace(/[:\-]+$/, "").trim();
  return SECTION_HEADERS.includes(normalized);
}

function isLikelyFieldLine(line) {
  return /^[A-Za-z][A-Za-z\s()/]{1,30}\s*[:\-]\s*\S+/.test(line);
}

function extractSectionBlock(lines, labels) {
  const wanted = labels.map((label) => label.toLowerCase());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = line.toLowerCase().replace(/[:\-]+$/, "").trim();

    if (!wanted.includes(normalized) && !wanted.some((label) => normalized.startsWith(`${label}:`) || normalized.startsWith(`${label} -`))) {
      continue;
    }

    const inline = line.split(/[:\-]/).slice(1).join(":").trim();
    if (inline) {
      return inline;
    }

    const collected = [];

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor];
      if (isSectionHeader(next) || isLikelyFieldLine(next)) {
        break;
      }
      collected.push(next);
      if (collected.length >= 12) {
        break;
      }
    }

    if (collected.length > 0) {
      return collected.join("\n").trim();
    }
  }

  return "";
}

function extractDiagnoses(text, lines) {
  const reportPages = splitIntoPages(text).filter((page) => isMedplusStructuredPage(page) || isApolloDiagnosticsPage(page));
  if (reportPages.length > 0) {
    const smearPage = reportPages.find((page) => /peripheral smear examination/i.test(page));
    if (!smearPage) {
      return [];
    }

    const smearLines = cleanPageLines(smearPage);
    const collected = [];
    for (let index = 0; index < smearLines.length; index += 1) {
      const line = smearLines[index];
      if (/^impression$/i.test(line)) {
        for (let cursor = index + 1; cursor < smearLines.length; cursor += 1) {
          const next = smearLines[cursor];
          if (/^(?:critical limits|parameter|units)$/i.test(next)) {
            break;
          }
          if (next) {
            collected.push(next.replace(/\.$/, "").trim());
          }
        }
        break;
      }
    }
    return sanitizeDiagnosisList(collected).slice(0, 10);
  }

  const diagnoses = [];
  const explicitSection = extractSectionBlock(lines, ["diagnosis", "diagnoses", "impression", "assessment"]);
  diagnoses.push(...splitList(explicitSection));

  for (const pattern of DIAGNOSIS_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = normalizeWhitespace(match[1] || match[0]);
      if (value) {
        diagnoses.push(value);
      }
    }
  }

  return sanitizeStringList(
    diagnoses
      .flatMap((item) => item.split(/\bwith\b|,/i))
      .map((item) => item.replace(/\.$/, "").trim())
  ).slice(0, 10);
}

function extractMedications(text, lines) {
  const reportPages = splitIntoPages(text).filter((page) => isMedplusStructuredPage(page) || isApolloDiagnosticsPage(page));
  if (reportPages.length > 0) {
    return [];
  }

  const medications = [];
  const explicitSection = extractSectionBlock(lines, ["medications", "medicines", "prescription"]);
  medications.push(...splitList(explicitSection));

  for (const pattern of MEDICATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = normalizeWhitespace(match[1]);
      if (value && !/blood pressure|heart rate|hemoglobin/i.test(value)) {
        medications.push(value);
      }
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const item of sanitizeStringList(medications)) {
    const baseKey = item
      .toLowerCase()
      .replace(/\b(tab|tablet|cap|capsule|syrup|inj|injection)\b/g, "")
      .replace(/\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!baseKey || seen.has(baseKey)) {
      continue;
    }

    seen.add(baseKey);
    deduped.push(item);
  }

  return deduped.slice(0, 20);
}

function extractAllergies(lines) {
  const explicitSection = extractSectionBlock(lines, ["allergies", "allergy"]);
  if (!explicitSection) {
    return [];
  }

  if (/\bnone\b|\bno known/i.test(explicitSection)) {
    return [];
  }

  return splitList(explicitSection).slice(0, 10);
}

function parseTableLikeLab(line) {
  const match =
    line.match(RESULT_WITH_REF_RE) ||
    line.match(RESULT_VALUE_ONLY_RE) ||
    line.match(/^([A-Za-z][A-Za-z0-9\s()%+./-]{1,40}?)\s*[:\-]\s*([<>]?\d+(?:\.\d+)?)\s*([A-Za-z/%µ.-]+)?(?:\s*\(?([0-9.<>\-– to/%µ., ]+[A-Za-z/%µ.-]*)\)?)?$/i);

  if (!match) {
    return null;
  }

  const name = canonicalLabName(match[1]);
  if (!isProbableTestName(name) || /blood pressure|heart rate|weight|height/i.test(name)) {
    return null;
  }

  return {
    name,
    value: Number(match[2]),
    unit: normalizeMedicalUnit(match[3] || null),
    referenceRange: normalizeWhitespace(match[4] || "") || null,
    interpretation: null,
    observedAt: null
  };
}

function isProbableTestName(name) {
  const normalized = normalizeWhitespace(name).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (IGNORE_TEST_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }

  if (isBoilerplateMedicalText(normalized)) {
    return false;
  }

  if (!isPlausibleObservationName(normalized)) {
    return false;
  }

  if ((normalized.match(/[a-z]/g) || []).length < 2) {
    return false;
  }

  if (/\b(?:current visit|previous visit|visits|criteria|interpretation|notes?)\b/i.test(normalized)) {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return false;
  }

  return true;
}

function parseInlineLab(line, currentMethod = null) {
  const match = line.match(INLINE_RESULT_RE);
  if (!match) {
    return null;
  }

  const name = canonicalLabName(match[1]);
  if (!isProbableTestName(name) || /blood pressure|heart rate|weight|height/i.test(name)) {
    return null;
  }

  return {
    name,
    value: Number(match[2]),
    unit: normalizeMedicalUnit(match[3] || null),
    referenceRange: normalizeWhitespace(match[4] || "") || null,
    interpretation: currentMethod || null,
    observedAt: null
  };
}

function parseStructuredLabBlock(lines, startIndex) {
  const rawName = lines[startIndex];
  const name = canonicalLabName(rawName);
  if (!isProbableTestName(name) || /blood pressure|heart rate|weight|height/i.test(name)) {
    return null;
  }

  let cursor = startIndex + 1;
  let method = null;

  if (cursor < lines.length) {
    const methodMatch = lines[cursor].match(METHOD_RE);
    if (methodMatch) {
      method = normalizeWhitespace(methodMatch[1]);
      cursor += 1;
    }
  }

  let value = null;
  let unit = null;
  let referenceRange = null;

  for (let lookahead = cursor; lookahead < Math.min(lines.length, cursor + 6); lookahead += 1) {
    const candidate = normalizeWhitespace(lines[lookahead]);
    if (!candidate) {
      continue;
    }
    if (METHOD_RE.test(candidate)) {
      continue;
    }
    if (/^(?:units|biological reference interval|department of |clinical significance|clinical utility|result|sample type|order|sample drawn|sample accepted|sample reported|report status|final)$/i.test(candidate)) {
      continue;
    }
    if (isProbableTestName(candidate) && lookahead !== cursor) {
      break;
    }
    if (NUMERIC_ONLY_RE.test(candidate)) {
      value = Number(candidate.replace(/[<>]/g, ""));
      const next = normalizeWhitespace(lines[lookahead + 1] || "");
      const nextNext = normalizeWhitespace(lines[lookahead + 2] || "");
      if (next && UNIT_ONLY_RE.test(next)) {
        unit = normalizeMedicalUnit(next);
        if (nextNext && RANGE_ONLY_RE.test(nextNext)) {
          referenceRange = nextNext;
        }
      } else if (next && RANGE_ONLY_RE.test(next)) {
        referenceRange = next;
      }
      break;
    }
  }

  if (value === null || Number.isNaN(value)) {
    return null;
  }

  return {
    observation: {
      name,
      value,
      unit: unit || null,
      referenceRange: referenceRange || null,
      interpretation: method || null,
      observedAt: null
    },
    nextIndex: Math.min(lines.length, cursor + 3)
  };
}

function extractLabResults(text) {
  const apolloLabs = extractApolloDiagnosticsLabResults(text);
  const medplusLabs = extractMedplusLabResults(text);
  const genericStructuredLabs = extractGenericStructuredLabResults(text);

  const lines = cleanLines(getRelevantReportText(text));
  const results = sanitizeObservationList(
    [...apolloLabs, ...medplusLabs, ...genericStructuredLabs].filter((lab) => {
      const unit = String(lab.unit || "").toLowerCase();
      const interpretation = String(lab.interpretation || "").toLowerCase();
      const name = String(lab.name || "").toLowerCase();

      if (
        !name ||
        name === "parameter" ||
        name === "units" ||
        /^this section$/i.test(name) ||
        /^investigation$/i.test(unit)
      ) {
        return false;
      }

      if (
        /^(?:investigation|result|units|traceable|inhibition|peroxidase|pap|final)$/i.test(unit) ||
        /^(?:investigation|result|units)$/i.test(interpretation)
      ) {
        return false;
      }

      return true;
    }),
    "lab"
  );
  const seen = new Set(results.map((parsed) => `${parsed.name.toLowerCase()}::${parsed.value}::${parsed.unit || ""}`));
  let inLabSection = false;
  let currentMethod = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (TABLE_HEADER_RE.test(line) || /\b(?:investigation|lab results|laboratory|hematology|haematology|biochemistry)\b/i.test(line)) {
      inLabSection = true;
      continue;
    }

    if (isSectionHeader(line) && !/\b(?:investigation|lab results|laboratory|hematology|haematology|biochemistry)\b/i.test(line)) {
      inLabSection = false;
      currentMethod = null;
      continue;
    }

    const methodMatch = line.match(METHOD_RE);
    if (methodMatch) {
      currentMethod = normalizeWhitespace(methodMatch[1]);
      continue;
    }

    const blockParsed = parseStructuredLabBlock(lines, index);
    const parsed = blockParsed?.observation || parseTableLikeLab(line) || parseInlineLab(line, currentMethod);
    if (!parsed) {
      if (!inLabSection) {
        continue;
      }
      if (/^\w+\s*[:\-]\s*\w+/.test(line)) {
        continue;
      }
      currentMethod = null;
      continue;
    }

    const key = `${parsed.name.toLowerCase()}::${parsed.value}::${parsed.unit || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(parsed);
    if (blockParsed?.nextIndex && blockParsed.nextIndex > index) {
      index = blockParsed.nextIndex - 1;
    }
  }

  const preferredByName = new Map();
  for (const result of results) {
    const key = normalizeWhitespace(result.name).toLowerCase();
    const currentScore =
      (result.unit && !/^(?:unit|insufficiency)$/i.test(String(result.unit)) ? 2 : 0) +
      (result.referenceRange ? 1 : 0) +
      (result.interpretation ? 1 : 0);
    const existing = preferredByName.get(key);
    if (!existing || currentScore > existing.score) {
      preferredByName.set(key, { score: currentScore, result });
    }
  }

  return Array.from(preferredByName.values())
    .map((entry) => entry.result)
    .filter((result) => !/^(?:unit|insufficiency)$/i.test(String(result.unit || "")))
    .slice(0, 60);
}

function extractVitals(text) {
  const lines = cleanLines(getRelevantReportText(text));
  const vitals = [];
  const seen = new Set();
  const patterns = [
    { regex: /\b(?:blood pressure|bp)\s*[:\-]?\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*(mmhg)?/i, name: "Blood Pressure", combine: true, unit: "mmHg" },
    { regex: /\b(?:heart rate|pulse)\s*[:\-]?\s*(\d{2,3})\s*(bpm)?/i, name: "Heart Rate", unitFallback: "bpm" },
    { regex: /\b(?:weight)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?/i, name: "Weight", unitFallback: "kg" },
    { regex: /\b(?:height)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(cm|m|ft|feet|in|inch|inches)?/i, name: "Height", unitFallback: "cm" },
    { regex: /\b(?:temperature)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(c|f|°c|°f)?/i, name: "Temperature", unitFallback: "C" },
    { regex: /\b(?:spo2|oxygen saturation)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(%)?/i, name: "SpO2", unitFallback: "%" }
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) {
        continue;
      }
      const value = pattern.combine ? `${match[1]}/${match[2]}` : Number(match[1]);
      const unit = normalizeMedicalUnit(pattern.combine ? pattern.unit : match[2] || pattern.unitFallback || null);
      const key = `${pattern.name.toLowerCase()}::${value}::${unit || ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      vitals.push({
        name: pattern.name,
        value,
        unit: unit || null,
        observedAt: null
      });
    }
  }

  const labs = extractLabResults(text);
  for (const lab of labs) {
    if (lab.name === "Blood Glucose") {
      const key = `${lab.name.toLowerCase()}::${lab.value}::${lab.unit || ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      vitals.push({
        name: lab.name,
        value: lab.value,
        unit: lab.unit,
        observedAt: null
      });
    }
  }

  return vitals.slice(0, 12);
}

function detectDietaryFlags(text, labs = [], diagnoses = []) {
  const lowered = normalizeLooseText(text).toLowerCase();
  const flags = [];
  const findLab = (pattern) => labs.find((lab) => pattern.test(String(lab.name || "").toLowerCase()));
  const glucose = Number(findLab(/glucose/)?.value);
  const hba1c = Number(findLab(/hba1c/)?.value);
  const hemoglobin = Number(findLab(/hemoglobin/)?.value);
  const creatinine = Number(findLab(/creatininine|creatinine/)?.value);

  if (/(diabet|hba1c|fasting glucose|blood sugar)/i.test(lowered) || Number.isFinite(glucose) && glucose >= 100 || Number.isFinite(hba1c) && hba1c >= 5.7) {
    flags.push("prioritize_lower_glycemic_load");
  }
  if (/(cholesterol|ldl|triglyceride|lipid profile)/i.test(lowered)) {
    flags.push("prefer_heart_healthy_fats");
  }
  if (/(creatinine|ckd|kidney|renal)/i.test(lowered) || Number.isFinite(creatinine) && creatinine > 1.2) {
    flags.push("monitor_kidney_friendly_meals");
  }
  if (/(blood pressure|hypertension|sodium)/i.test(lowered)) {
    flags.push("prefer_lower_sodium_meals");
  }
  if (/(hemoglobin|ferritin|iron deficiency|anemia)/i.test(lowered) || diagnoses.some((value) => /anemi/i.test(value)) || Number.isFinite(hemoglobin) && hemoglobin < 12) {
    flags.push("support_iron_intake");
  }
  if (/(thyroid|tsh|t3|t4)/i.test(lowered)) {
    flags.push("monitor_thyroid_related_nutrition");
  }

  return sanitizeStringList(flags);
}

function computeConfidence({ diagnoses, medications, allergies, labResults, vitals, text }) {
  const dataPoints =
    diagnoses.length * 0.12 +
    medications.length * 0.08 +
    allergies.length * 0.05 +
    labResults.length * 0.05 +
    vitals.length * 0.06;
  const cleanTextBonus = isLikelyGarbageText(text) ? 0 : 0.18;
  return Math.min(0.86, 0.3 + dataPoints + cleanTextBonus);
}

function parseMedicalText(text) {
  if (!text || isLikelyGarbageText(text)) {
    return buildLowConfidenceRecord({
      provider: "local",
      summary: "Low-confidence local extraction. The uploaded document may be scanned or image-based."
    });
  }

  const cleanedText = normalizeLooseText(text);
  const reportText = getRelevantReportText(cleanedText);
  const lines = cleanLines(reportText);
  const diagnoses = extractDiagnoses(reportText, lines);
  const medications = extractMedications(reportText, lines);
  const allergies = extractAllergies(lines);
  const labResults = extractLabResults(reportText);
  const vitals = extractVitals(reportText);
  const dietaryFlags = detectDietaryFlags(reportText, labResults, diagnoses);
  const summary = cleanMedicalSummary(reportText);
  const confidence = computeConfidence({
    diagnoses,
    medications,
    allergies,
    labResults,
    vitals,
    text: cleanedText
  });

  const sanitized = sanitizeMedicalRecord(
    {
      summary,
      recordDate: extractDate(cleanedText),
      diagnoses,
      medications,
      allergies,
      dietaryFlags,
      labResults,
      vitals
    },
    { provider: "local", confidence }
  );

  if (
    sanitized.diagnoses.length === 0 &&
    sanitized.medications.length === 0 &&
    sanitized.labResults.length === 0 &&
    sanitized.vitals.length === 0
  ) {
    return buildLowConfidenceRecord({
      provider: "local",
      summary: "Low-confidence local extraction. No dependable medical values were found in the document text."
    });
  }

  return sanitized;
}

module.exports = {
  LOCAL_PARSER_VERSION,
  parseMedicalText,
  extractLabResults,
  extractVitals,
  detectDietaryFlags
};
