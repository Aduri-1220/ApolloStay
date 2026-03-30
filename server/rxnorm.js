function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function classifyMedication(name) {
  const text = normalize(name);
  const tags = new Set();

  if (/(metformin|insulin|glimepiride|gliclazide|glipizide|sitagliptin|empagliflozin|dapagliflozin|semaglutide)/.test(text)) {
    tags.add("glucose_sensitive");
  }
  if (/(levothyroxine|thyroxine|eltroxin)/.test(text)) {
    tags.add("thyroid_support");
  }
  if (/(warfarin|apixaban|rivaroxaban|dabigatran|clopidogrel|aspirin)/.test(text)) {
    tags.add("bleeding_caution");
  }
  if (/(atorvastatin|rosuvastatin|simvastatin|pravastatin)/.test(text)) {
    tags.add("heart_healthy");
  }
  if (/(lisinopril|losartan|amlodipine|telmisartan|olmesartan|metoprolol|atenolol|hydrochlorothiazide)/.test(text)) {
    tags.add("low_sodium");
  }
  if (/(prednisone|prednisolone|dexamethasone|methylprednisolone)/.test(text)) {
    tags.add("glucose_sensitive");
  }

  return Array.from(tags);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
}

async function lookupMedicationContext(name) {
  const originalName = String(name || "").trim();
  if (!originalName) {
    return null;
  }

  const fallback = {
    originalName,
    normalizedName: originalName,
    rxcui: null,
    tags: classifyMedication(originalName),
    source: "local"
  };

  if (process.env.ENABLE_RXNORM !== "true") {
    return fallback;
  }

  try {
    const approximate = await fetchJson(
      `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(originalName)}&maxEntries=1`
    );
    const candidate = approximate?.approximateGroup?.candidate?.[0];
    const rxcui = candidate?.rxcui || null;

    if (!rxcui) {
      return fallback;
    }

    const properties = await fetchJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${encodeURIComponent(rxcui)}/properties.json`);
    const normalizedName = properties?.properties?.name || originalName;

    return {
      originalName,
      normalizedName,
      rxcui,
      tags: classifyMedication(normalizedName),
      source: "rxnorm"
    };
  } catch (error) {
    return fallback;
  }
}

async function enrichMedicationList(medications) {
  const items = Array.isArray(medications) ? medications : [];
  const enriched = await Promise.all(items.map((item) => lookupMedicationContext(item)));
  return enriched.filter(Boolean);
}

module.exports = {
  enrichMedicationList
};
