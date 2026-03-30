const { execFileSync } = require("node:child_process");
const { parseCsvLine } = require("./csv");

const zipCache = new Map();
const foodCache = new Map();

function readZipCsv(zipPath) {
  if (zipCache.has(zipPath)) {
    return zipCache.get(zipPath);
  }

  const output = execFileSync("unzip", ["-p", zipPath], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });

  const rows = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseCsvLine(line));

  zipCache.set(zipPath, rows);
  return rows;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildIndianNutritionRows(zipPath) {
  const rows = readZipCsv(zipPath);
  const [, ...dataRows] = rows;

  return dataRows
    .map((row, index) => ({
      id: `indian-nutrition:${index + 1}`,
      description: row[0],
      source: "indian-nutrition",
      dataType: "indian_food_dataset",
      basis: "per_100g",
      quantityUnit: "100g",
      nutrientsPer100g: {
        calories: toNumber(row[1]),
        carbs: toNumber(row[2]),
        protein: toNumber(row[3]),
        fat: toNumber(row[4])
      },
      metadata: {
        freeSugar: toNumber(row[5]),
        fibre: toNumber(row[6]),
        sodiumMg: toNumber(row[7]),
        calciumMg: toNumber(row[8]),
        ironMg: toNumber(row[9]),
        vitaminCMg: toNumber(row[10]),
        folateUg: toNumber(row[11])
      }
    }))
    .filter((row) => row.description);
}

function buildIndianMealRows(zipPath) {
  const rows = readZipCsv(zipPath);
  const [, ...dataRows] = rows;

  return dataRows
    .map((row, index) => ({
      id: `indian-meals:${index + 1}`,
      description: row[0],
      source: "indian-meals",
      dataType: "indian_regional_meal",
      basis: "per_serving",
      quantityUnit: "serving",
      nutrientsPer100g: {
        calories: toNumber(row[4]),
        carbs: toNumber(row[5]),
        protein: toNumber(row[7]),
        fat: toNumber(row[6])
      },
      metadata: {
        state: row[1],
        mealType: row[2],
        allergicIngredients: row[3],
        sugar: toNumber(row[8]),
        sodium: toNumber(row[9]),
        vitaminContent: row[10],
        servingNote: "Regional meal dataset values are treated as per serving totals."
      }
    }))
    .filter((row) => row.description);
}

function getIndianFoods(indianNutritionZipPath, indianMealsZipPath) {
  const cacheKey = `${indianNutritionZipPath}::${indianMealsZipPath}`;
  if (foodCache.has(cacheKey)) {
    return foodCache.get(cacheKey);
  }

  const foods = [
    ...buildIndianNutritionRows(indianNutritionZipPath),
    ...buildIndianMealRows(indianMealsZipPath)
  ];

  foodCache.set(cacheKey, foods);
  return foods;
}

function searchIndianFoods(indianNutritionZipPath, indianMealsZipPath, query, limit = 12) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const seen = new Set();

  return getIndianFoods(indianNutritionZipPath, indianMealsZipPath)
    .filter((food) => food.description.toLowerCase().includes(normalizedQuery))
    .filter((food) => {
      const key = `${food.description.toLowerCase()}::${food.metadata?.state || ""}::${food.source}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((food) => ({
      fdcId: food.id,
      description: food.description,
      dataType: food.dataType,
      source: food.source,
      basis: food.basis,
      quantityUnit: food.quantityUnit,
      metadata: {
        state: food.metadata?.state || null,
        mealType: food.metadata?.mealType || null
      }
    }));
}

function loadIndianFoodDetail(indianNutritionZipPath, indianMealsZipPath, id) {
  const food = getIndianFoods(indianNutritionZipPath, indianMealsZipPath).find((item) => item.id === id);
  if (!food) {
    return null;
  }

  return {
    fdcId: food.id,
    description: food.description,
    dataType: food.dataType,
    source: food.source,
    basis: food.basis,
    quantityUnit: food.quantityUnit,
    nutrientsPer100g: food.nutrientsPer100g,
    metadata: food.metadata
  };
}

module.exports = {
  getIndianFoods,
  searchIndianFoods,
  loadIndianFoodDetail
};
