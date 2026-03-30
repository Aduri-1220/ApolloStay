const fs = require("node:fs");
const readline = require("node:readline");

const fileCache = new Map();
const nutrientCache = new Map();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectDelimiter(line) {
  const candidates = [",", "\t", "|", "^", "~"];
  const ranked = candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((left, right) => right.count - left.count);
  return ranked[0]?.count > 1 ? ranked[0].delimiter : ",";
}

function splitDelimited(line, delimiter) {
  if (delimiter === ",") {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const next = line[index + 1];
      if (character === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (character === delimiter && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += character;
      }
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  return line.split(delimiter).map((cell) => cell.trim());
}

function buildHeaderIndex(headerRow) {
  return headerRow.reduce((accumulator, cell, index) => {
    accumulator[normalize(cell)] = index;
    return accumulator;
  }, {});
}

function findHeaderRow(rows, aliases) {
  for (let index = 0; index < rows.length; index += 1) {
    const headerIndex = buildHeaderIndex(rows[index]);
    const matchesAll = aliases.every((alias) => headerIndex[normalize(alias)] !== undefined);
    if (matchesAll) {
      return {
        headerRow: rows[index],
        dataRows: rows.slice(index + 1)
      };
    }
  }

  return {
    headerRow: rows[0] || [],
    dataRows: rows.slice(1)
  };
}

function getCell(row, headerIndex, aliases) {
  for (const alias of aliases) {
    const index = headerIndex[normalize(alias)];
    if (index !== undefined) {
      return row[index];
    }
  }
  return "";
}

function toNumber(value) {
  const parsed = Number(String(value || "").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

async function readDelimitedFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }

  const stream = fs.createReadStream(filePath);
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const rows = [];
  let delimiter = ",";
  let isFirstLine = true;

  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }
    if (isFirstLine) {
      delimiter = detectDelimiter(line);
      isFirstLine = false;
    }
    rows.push(splitDelimited(line, delimiter));
  }

  fileCache.set(filePath, rows);
  return rows;
}

async function loadFnddsNutrients(nutrientFilePath) {
  if (!nutrientFilePath || !fs.existsSync(nutrientFilePath)) {
    return new Map();
  }
  if (nutrientCache.has(nutrientFilePath)) {
    return nutrientCache.get(nutrientFilePath);
  }

  const rows = await readDelimitedFile(nutrientFilePath);
  if (!rows || rows.length < 2) {
    const empty = new Map();
    nutrientCache.set(nutrientFilePath, empty);
    return empty;
  }

  const { headerRow, dataRows } = findHeaderRow(rows, [
    "food code",
    "energy kcal",
    "protein g",
    "carbohydrate g",
    "total fat g"
  ]);
  const headerIndex = buildHeaderIndex(headerRow);
  const nutrients = new Map();

  for (const row of dataRows) {
    const foodCode = getCell(row, headerIndex, ["food code", "foodcode", "food_code"]);
    if (!foodCode) {
      continue;
    }

    const current = {
      calories: null,
      protein: null,
      carbs: null,
      fat: null
    };

    current.calories = toNumber(getCell(row, headerIndex, ["energy kcal", "energy (kcal)", "calories"]));
    current.protein = toNumber(getCell(row, headerIndex, ["protein g", "protein (g)", "protein"]));
    current.carbs = toNumber(getCell(row, headerIndex, ["carbohydrate g", "carbohydrate (g)", "carbohydrate"]));
    current.fat = toNumber(getCell(row, headerIndex, ["total fat g", "total fat (g)", "fat", "total lipid fat g"]));

    nutrients.set(foodCode, current);
  }

  nutrientCache.set(nutrientFilePath, nutrients);
  return nutrients;
}

async function getFnddsMeals(mainFoodFilePath, nutrientFilePath) {
  if (!mainFoodFilePath || !fs.existsSync(mainFoodFilePath)) {
    return [];
  }

  const rows = await readDelimitedFile(mainFoodFilePath);
  if (!rows || rows.length < 2) {
    return [];
  }

  const nutrients = await loadFnddsNutrients(nutrientFilePath);
  const { headerRow, dataRows } = findHeaderRow(rows, ["food code", "main food description"]);
  const headerIndex = buildHeaderIndex(headerRow);

  return dataRows
    .map((row) => {
      const foodCode = getCell(row, headerIndex, ["food code", "foodcode", "food_code"]);
      const description = getCell(
        row,
        headerIndex,
        ["main food description", "food description", "description", "main description"]
      );
      if (!foodCode || !description) {
        return null;
      }

      return {
        id: `fndds:${foodCode}`,
        description,
        source: "fndds",
        dataType: "fndds_mixed_dish",
        basis: "per_100g",
        quantityUnit: "100g",
        nutrientsPer100g: nutrients.get(foodCode) || {
          calories: null,
          protein: null,
          carbs: null,
          fat: null
        },
        metadata: {
          foodCode,
          additionalDescription: getCell(
            row,
            headerIndex,
            ["additional food description", "additional description", "subcode description"]
          ),
          categoryNumber: getCell(
            row,
            headerIndex,
            ["wweia category number", "wweia category no", "category number"]
          ),
          categoryDescription: getCell(
            row,
            headerIndex,
            ["wweia category description", "category description", "wweia description"]
          )
        }
      };
    })
    .filter(Boolean);
}

module.exports = {
  getFnddsMeals
};
