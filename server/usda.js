const fs = require("node:fs");
const readline = require("node:readline");
const { parseCsvLine } = require("./csv");

const MACRO_NUTRIENT_IDS = {
  calories: ["1008", "2047", "2048"],
  protein: ["1003"],
  fat: ["1004"],
  carbs: ["1005"]
};

const foundationFoodCache = new Map();

async function getFoundationFoodIds(foundationFoodCsvPath) {
  if (foundationFoodCache.has(foundationFoodCsvPath)) {
    return foundationFoodCache.get(foundationFoodCsvPath);
  }

  const ids = new Set();
  const stream = fs.createReadStream(foundationFoodCsvPath);
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let isFirstLine = true;

  for await (const line of reader) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const [fdcId] = parseCsvLine(line);
    if (fdcId) {
      ids.add(fdcId);
    }
  }

  foundationFoodCache.set(foundationFoodCsvPath, ids);
  return ids;
}

async function searchFoods(foodCsvPath, foundationFoodCsvPath, query, limit = 12) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const foundationIds = await getFoundationFoodIds(foundationFoodCsvPath);
  const stream = fs.createReadStream(foodCsvPath);
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const matches = [];
  const seenDescriptions = new Set();
  let isFirstLine = true;

  for await (const line of reader) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const [fdcId, dataType, description] = parseCsvLine(line);
    if (!fdcId || !description) {
      continue;
    }

    if (!foundationIds.has(fdcId) || dataType !== "foundation_food") {
      continue;
    }

    const normalizedDescription = description.toLowerCase();

    if (!normalizedDescription.includes(normalizedQuery)) {
      continue;
    }

    if (seenDescriptions.has(normalizedDescription)) {
      continue;
    }

    seenDescriptions.add(normalizedDescription);
    matches.push({ fdcId, description, dataType });

    if (matches.length >= limit) {
      break;
    }
  }

  reader.close();
  stream.close();
  return matches;
}

async function findFoodById(foodCsvPath, targetFdcId) {
  const stream = fs.createReadStream(foodCsvPath);
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let isFirstLine = true;

  for await (const line of reader) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const [fdcId, dataType, description] = parseCsvLine(line);
    if (!fdcId || !description) {
      continue;
    }
    if (fdcId === String(targetFdcId)) {
      reader.close();
      stream.close();
      return { fdcId, dataType, description };
    }
  }

  return null;
}

async function loadMacrosForFood(foodNutrientCsvPath, targetFdcId) {
  const stream = fs.createReadStream(foodNutrientCsvPath);
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let isFirstLine = true;
  const macros = {
    calories: null,
    protein: null,
    carbs: null,
    fat: null
  };

  for await (const line of reader) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const [, fdcId, nutrientId, amount] = parseCsvLine(line);
    if (fdcId !== String(targetFdcId)) {
      continue;
    }

    if (MACRO_NUTRIENT_IDS.calories.includes(nutrientId) && macros.calories === null) {
      macros.calories = Number(amount);
    }

    if (MACRO_NUTRIENT_IDS.protein.includes(nutrientId)) {
      macros.protein = Number(amount);
    }

    if (MACRO_NUTRIENT_IDS.carbs.includes(nutrientId)) {
      macros.carbs = Number(amount);
    }

    if (MACRO_NUTRIENT_IDS.fat.includes(nutrientId)) {
      macros.fat = Number(amount);
    }
  }

  return {
    calories: macros.calories === null ? null : Number(macros.calories.toFixed(2)),
    protein: macros.protein === null ? null : Number(macros.protein.toFixed(2)),
    carbs: macros.carbs === null ? null : Number(macros.carbs.toFixed(2)),
    fat: macros.fat === null ? null : Number(macros.fat.toFixed(2))
  };
}

async function loadFoodDetail(foodCsvPath, foodNutrientCsvPath, fdcId) {
  const food = await findFoodById(foodCsvPath, fdcId);
  if (!food) {
    return null;
  }

  const nutrientsPer100g = await loadMacrosForFood(foodNutrientCsvPath, fdcId);

  return {
    ...food,
    basis: "per_100g",
    quantityUnit: "100g",
    nutrientsPer100g
  };
}

module.exports = {
  searchFoods,
  loadFoodDetail
};
