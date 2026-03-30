function parseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBarcodeValue(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function buildBarcodeCandidates(value) {
  const normalized = normalizeBarcodeValue(value);
  if (!normalized) {
    return [];
  }

  const candidates = new Set([normalized]);

  if (normalized.length === 12) {
    candidates.add(`0${normalized}`);
  }
  if (normalized.length === 13 && normalized.startsWith("0")) {
    candidates.add(normalized.slice(1));
  }

  return Array.from(candidates);
}

function parseServingWeightGrams(servingSize) {
  const match = String(servingSize || "").match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (!match) {
    return null;
  }

  const grams = Number(match[1]);
  return Number.isFinite(grams) ? grams : null;
}

function buildOpenFoodFactsRecord(barcode, product) {
  const nutriments = product?.nutriments || {};
  const calories =
    parseNumber(nutriments["energy-kcal_100g"]) ??
    parseNumber(nutriments["energy-kcal"]) ??
    parseNumber(nutriments["energy-kcal_value"]);
  const protein = parseNumber(nutriments.proteins_100g) ?? parseNumber(nutriments.proteins);
  const carbs = parseNumber(nutriments.carbohydrates_100g) ?? parseNumber(nutriments.carbohydrates);
  const fat = parseNumber(nutriments.fat_100g) ?? parseNumber(nutriments.fat);

  if ([calories, protein, carbs, fat].every((value) => value === null)) {
    return null;
  }

  const servingSize = product.serving_size || "";
  const gramsPerServing = parseServingWeightGrams(servingSize);

  return {
    description:
      product.product_name ||
      product.generic_name ||
      product.product_name_en ||
      "Scanned food",
    brand: product.brands || product.brands_tags?.[0] || null,
    barcode,
    calories: calories ?? 0,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
    gramsPerServing,
    metadata: {
      brand: product.brands || null,
      servingSize: servingSize || null,
      categories: product.categories || null,
      imageUrl: product.image_url || null,
      barcodeProvider: "openfoodfacts"
    }
  };
}

async function lookupBarcodeProduct(barcode) {
  const candidates = buildBarcodeCandidates(barcode);
  if (candidates.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(candidate)}.json`, {
        headers: {
          "User-Agent": "ApolloStay/1.0"
        }
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      if (payload?.status !== 1 || !payload?.product) {
        continue;
      }

      return buildOpenFoodFactsRecord(candidate, payload.product);
    } catch (error) {
      continue;
    }
  }

  return null;
}

module.exports = {
  lookupBarcodeProduct,
  buildBarcodeCandidates
};
