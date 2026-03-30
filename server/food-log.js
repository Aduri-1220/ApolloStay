const { randomUUID } = require("node:crypto");
const { normalizeFoodSearchQuery } = require("./food-aliases");

const MEAL_WINDOWS = {
  breakfast: { startHour: 6, endHour: 10, label: "6AM - 10AM" },
  lunch: { startHour: 11, endHour: 14, label: "11AM - 2PM" },
  dinner: { startHour: 18, endHour: 22, label: "6PM - 10PM" },
  snack: { startHour: 15, endHour: 17, label: "Anytime" }
};

const DEFAULT_PORTION_FACTORS = {
  g: 1,
  gram: 1,
  grams: 1,
  serving: 100,
  servings: 100,
  cup: 240,
  cups: 240,
  glass: 250,
  glasses: 250,
  katori: 150,
  bowls: 150,
  bowl: 150,
  ladle: 60,
  ladles: 60,
  tbsp: 15,
  tsp: 5,
  piece: 50,
  pieces: 50
};

function round(value) {
  return Number(value.toFixed(2));
}

function formatLocalDateKey(dateInput) {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scaledValue(value, multiplier) {
  if (value === null || value === undefined) {
    return null;
  }

  return round(value * multiplier);
}

function dateKeyFromIso(isoString) {
  return formatLocalDateKey(isoString);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function inferPreferredPortionUnit(foodDetail) {
  const description = normalizeText(foodDetail?.description);
  const metadata = foodDetail?.metadata || {};
  const basis = foodDetail?.basis || "per_100g";

  if (metadata.preferredPortionUnit) {
    return normalizeText(metadata.preferredPortionUnit);
  }

  if (!description) {
    return basis === "per_serving" ? "serving" : "g";
  }

  if (/\b(?:tea|chai|coffee|milk|lassi|buttermilk|juice|smoothie|shake|soup)\b/.test(description)) {
    return /\b(?:lassi|buttermilk|juice)\b/.test(description) ? "glass" : "cup";
  }

  if (/\b(?:idli|dosa|vada|chapati|roti|phulka|paratha|poori|puri|appam|dhokla|sandwich|omelette|omelet|egg|cutlet)\b/.test(description)) {
    return "piece";
  }

  if (/\b(?:dal|sambar|rasam|sabzi|subzi|curry|rajma|chole|chana masala|kadhi)\b/.test(description)) {
    return "katori";
  }

  if (/\b(?:biryani|rice|pulao|pulav|khichdi|upma|poha|noodles|fried rice|curd rice|lemon rice|sambar rice)\b/.test(description)) {
    return basis === "per_serving" ? "serving" : "g";
  }

  return basis === "per_serving" ? "serving" : "g";
}

function getPortionOptions(foodDetail) {
  const options = new Map();
  const metadata = foodDetail?.metadata || {};
  const basis = foodDetail?.basis || "per_100g";

  if (basis === "per_serving") {
    options.set("serving", {
      unit: "serving",
      label: "Servings",
      multiplier: 1
    });
  } else {
    options.set("g", {
      unit: "g",
      label: "Grams",
      multiplier: 1
    });
  }

  const gramsPerServing = Number(metadata.gramsPerServing || metadata.servingWeightGrams || 0);
  if (basis === "per_100g" && gramsPerServing > 0) {
    options.set("serving", {
      unit: "serving",
      label: "Servings",
      multiplier: gramsPerServing
    });
  }

  const cupGrams = Number(metadata.cupWeightGrams || metadata.cupGrams || 0) || 240;
  const glassGrams = Number(metadata.glassWeightGrams || 0) || 250;
  const katoriGrams = Number(metadata.katoriWeightGrams || metadata.bowlWeightGrams || 0) || 150;
  const pieceGrams = Number(metadata.pieceWeightGrams || metadata.pieceGrams || 0) || 50;

  options.set("cup", {
    unit: "cup",
    label: "Cups",
    multiplier: basis === "per_serving" ? Number(metadata.servingsPerCup || 1) || 1 : cupGrams
  });
  options.set("glass", {
    unit: "glass",
    label: "Glasses",
    multiplier: basis === "per_serving" ? Number(metadata.servingsPerGlass || 1) || 1 : glassGrams
  });
  options.set("katori", {
    unit: "katori",
    label: "Katoris",
    multiplier: basis === "per_serving" ? Number(metadata.servingsPerKatori || 1) || 1 : katoriGrams
  });
  options.set("piece", {
    unit: "piece",
    label: "Pieces",
    multiplier: basis === "per_serving" ? Number(metadata.servingsPerPiece || 1) || 1 : pieceGrams
  });

  if (Array.isArray(metadata.portionOptions)) {
    for (const option of metadata.portionOptions) {
      const unit = normalizeText(option.unit);
      const label = String(option.label || option.unit || "").trim();
      const multiplier = Number(option.multiplier);

      if (unit && label && multiplier > 0) {
        options.set(unit, { unit, label, multiplier });
      }
    }
  }

  const preferredUnit = inferPreferredPortionUnit(foodDetail);
  return Array.from(options.values()).sort((left, right) => {
    if (left.unit === preferredUnit) {
      return -1;
    }
    if (right.unit === preferredUnit) {
      return 1;
    }
    return 0;
  });
}

function decorateFoodDetailWithPortionHints(foodDetail) {
  if (!foodDetail) {
    return null;
  }

  return {
    ...foodDetail,
    metadata: {
      ...(foodDetail.metadata || {}),
      preferredPortionUnit: inferPreferredPortionUnit(foodDetail)
    }
  };
}

function normalizeQuantityForFood(foodDetail, quantity, portionUnit) {
  const portionOptions = getPortionOptions(foodDetail);
  const normalizedUnit = normalizeText(portionUnit) || (foodDetail?.basis === "per_serving" ? "serving" : "g");
  const selectedOption = portionOptions.find((option) => option.unit === normalizedUnit);

  if (selectedOption) {
    return {
      quantity,
      portionUnit: selectedOption.unit,
      effectiveQuantity: quantity * selectedOption.multiplier,
      portionLabel: selectedOption.label,
      portionOptions
    };
  }

  const fallbackMultiplier = DEFAULT_PORTION_FACTORS[normalizedUnit] || 1;
  return {
    quantity,
    portionUnit: normalizedUnit,
    effectiveQuantity: quantity * fallbackMultiplier,
    portionLabel: normalizedUnit,
    portionOptions
  };
}

function computeLoggedNutrients(foodDetail, effectiveQuantity) {
  const multiplier = foodDetail.basis === "per_serving" ? effectiveQuantity : effectiveQuantity / 100;

  return {
    calories: scaledValue(foodDetail.nutrientsPer100g.calories, multiplier),
    protein: scaledValue(foodDetail.nutrientsPer100g.protein, multiplier),
    carbs: scaledValue(foodDetail.nutrientsPer100g.carbs, multiplier),
    fat: scaledValue(foodDetail.nutrientsPer100g.fat, multiplier)
  };
}

function summarizeLogs(logs) {
  return logs.reduce(
    (summary, log) => {
      if (typeof log.nutrients.calories === "number") {
        summary.calories += log.nutrients.calories;
      } else {
        summary.hasIncompleteData = true;
      }

      if (typeof log.nutrients.protein === "number") {
        summary.protein += log.nutrients.protein;
      } else {
        summary.hasIncompleteData = true;
      }

      if (typeof log.nutrients.carbs === "number") {
        summary.carbs += log.nutrients.carbs;
      } else {
        summary.hasIncompleteData = true;
      }

      if (typeof log.nutrients.fat === "number") {
        summary.fat += log.nutrients.fat;
      } else {
        summary.hasIncompleteData = true;
      }

      summary.mealCount += 1;
      return summary;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, hasIncompleteData: false }
  );
}

function buildMealBreakdown(logs) {
  return Object.entries(MEAL_WINDOWS).map(([mealType, window]) => {
    const mealLogs = logs.filter((log) => log.mealType === mealType);
    const summary = summarizeLogs(mealLogs);

    return {
      mealType,
      label: mealType[0].toUpperCase() + mealType.slice(1),
      timeWindow: window.label,
      summary: {
        calories: round(summary.calories),
        protein: round(summary.protein),
        carbs: round(summary.carbs),
        fat: round(summary.fat),
        itemCount: mealLogs.length
      },
      logs: mealLogs.sort((left, right) => right.consumedAt.localeCompare(left.consumedAt))
    };
  });
}

function startOfDay(dateInput) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysBetween(left, right) {
  const millis = startOfDay(right).getTime() - startOfDay(left).getTime();
  return Math.round(millis / (24 * 60 * 60 * 1000));
}

function buildStreaks(logs, todayIso = new Date().toISOString()) {
  const uniqueDates = Array.from(new Set(logs.map((log) => log.date))).sort().reverse();
  const today = startOfDay(todayIso);
  let current = 0;
  let best = 0;
  let running = 0;
  let previousDate = null;

  const ascendingDates = [...uniqueDates].sort();
  for (const dateKey of ascendingDates) {
    const currentDate = startOfDay(dateKey);
    if (!previousDate || daysBetween(previousDate, currentDate) === 1) {
      running += 1;
    } else {
      running = 1;
    }
    best = Math.max(best, running);
    previousDate = currentDate;
  }

  if (uniqueDates.length > 0) {
    const latestLoggedDate = startOfDay(uniqueDates[0]);
    const gapFromToday = daysBetween(latestLoggedDate, todayIso);

    // Keep the streak active through yesterday so users don't drop to zero
    // before they've actually missed a full day of logging.
    if (gapFromToday <= 1) {
      current = 1;

      for (let index = 1; index < uniqueDates.length; index += 1) {
        const previousLoggedDate = startOfDay(uniqueDates[index - 1]);
        const nextLoggedDate = startOfDay(uniqueDates[index]);

        if (daysBetween(nextLoggedDate, previousLoggedDate) === 1) {
          current += 1;
        } else {
          break;
        }
      }
    }
  }

  return {
    currentLoggingStreak: current,
    bestLoggingStreak: best
  };
}

function buildWeeklySummary(logs, profile) {
  const today = startOfDay(new Date());
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = formatLocalDateKey(date);
    const dayLogs = logs.filter((log) => log.date === key);
    const summary = summarizeLogs(dayLogs);

    days.push({
      date: key,
      calories: round(summary.calories),
      protein: round(summary.protein),
      carbs: round(summary.carbs),
      fat: round(summary.fat),
      mealCount: summary.mealCount
    });
  }

  const totals = days.reduce(
    (accumulator, day) => {
      accumulator.calories += day.calories;
      accumulator.protein += day.protein;
      accumulator.carbs += day.carbs;
      accumulator.fat += day.fat;
      accumulator.mealCount += day.mealCount;
      return accumulator;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 }
  );

  const averageCalories = round(totals.calories / 7);
  const calorieTarget = Number(profile?.dailyCalorieTarget || 0);

  return {
    days,
    totals: {
      calories: round(totals.calories),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
      mealCount: totals.mealCount
    },
    averages: {
      calories: averageCalories,
      protein: round(totals.protein / 7),
      carbs: round(totals.carbs / 7),
      fat: round(totals.fat / 7)
    },
    adherence: calorieTarget > 0 ? round((averageCalories / calorieTarget) * 100) : 0,
    streaks: buildStreaks(logs)
  };
}

function buildRecentFoods(logs, favorites = []) {
  const favoriteIds = new Set(favorites.map((item) => item.fdcId));
  const seen = new Set();
  const recent = [];

  for (const log of [...logs].sort((left, right) => right.consumedAt.localeCompare(left.consumedAt))) {
    if (seen.has(log.food.fdcId)) {
      continue;
    }

    seen.add(log.food.fdcId);
    recent.push({
      ...log.food,
      lastLoggedAt: log.consumedAt,
      isFavorite: favoriteIds.has(log.food.fdcId)
    });
  }

  return recent.slice(0, 12);
}

function buildFavoriteFoods(favorites, recentFoods = []) {
  const recentMap = new Map(recentFoods.map((item) => [item.fdcId, item]));
  return favorites.map((favorite) => ({
    ...recentMap.get(favorite.fdcId),
    ...favorite,
    isFavorite: true
  }));
}

function normalizeCustomFoodRecord(food) {
  const createdAt = food?.createdAt || new Date().toISOString();
  const usageCount = Number(food?.usageCount || 0);

  return {
    ...food,
    normalizedName: normalizeFoodSearchQuery(food?.normalizedName || food?.description || ""),
    usageCount: Number.isFinite(usageCount) && usageCount >= 0 ? usageCount : 0,
    promotionStatus: ["private", "review", "approved", "rejected"].includes(food?.promotionStatus)
      ? food.promotionStatus
      : "private",
    reviewNotes: typeof food?.reviewNotes === "string" ? food.reviewNotes : "",
    createdBy: food?.createdBy || food?.userId || null,
    createdAt,
    lastUsedAt: food?.lastUsedAt || createdAt,
    reviewedAt: food?.reviewedAt || null,
    reviewedBy: food?.reviewedBy || null,
    catalogStatus: ["none", "approved", "rejected", "mapped"].includes(food?.catalogStatus)
      ? food.catalogStatus
      : "none",
    catalogPromotedAt: food?.catalogPromotedAt || null,
    catalogPromotedBy: food?.catalogPromotedBy || null,
    mappedSourceId: typeof food?.mappedSourceId === "string" ? food.mappedSourceId : null
  };
}

function createCustomFoodRecord({ userId, input }) {
  return normalizeCustomFoodRecord({
    id: randomUUID(),
    userId,
    barcode: String(input.barcode || "").trim() || null,
    description: input.description,
    brand: String(input.brand || "").trim() || null,
    basis: "per_100g",
    quantityUnit: "g",
    dataType: "custom_food",
    source: "custom",
    metadata: {
      brand: String(input.brand || "").trim() || null,
      preferredPortionUnit: "g",
      gramsPerServing: input.gramsPerServing ? Number(input.gramsPerServing) : null,
      portionOptions: [
        input.gramsPerServing
          ? { unit: "serving", label: "Servings", multiplier: Number(input.gramsPerServing) }
          : null,
        { unit: "cup", label: "Cups", multiplier: Number(input.cupWeightGrams || 240) },
        { unit: "piece", label: "Pieces", multiplier: Number(input.pieceWeightGrams || 50) }
      ].filter(Boolean)
    },
    nutrientsPer100g: {
      calories: Number(input.calories),
      protein: Number(input.protein),
      carbs: Number(input.carbs),
      fat: Number(input.fat)
    },
    createdAt: new Date().toISOString(),
    normalizedName: normalizeFoodSearchQuery(input.description),
    usageCount: 0,
    promotionStatus: "private",
    reviewNotes: "",
    createdBy: userId,
    lastUsedAt: null,
    reviewedAt: null,
    reviewedBy: null
  });
}

function matchesFoodQuery(food, query) {
  const needle = normalizeText(query);
  if (!needle) {
    return true;
  }

  return [
    food.description,
    food.normalizedName,
    food.barcode,
    food.brand,
    food.source,
    food.dataType
  ]
    .filter(Boolean)
    .some((value) => normalizeText(value).includes(needle));
}

module.exports = {
  dateKeyFromIso,
  computeLoggedNutrients,
  summarizeLogs,
  inferPreferredPortionUnit,
  getPortionOptions,
  decorateFoodDetailWithPortionHints,
  normalizeQuantityForFood,
  buildMealBreakdown,
  buildWeeklySummary,
  buildRecentFoods,
  buildFavoriteFoods,
  normalizeCustomFoodRecord,
  createCustomFoodRecord,
  matchesFoodQuery,
  MEAL_WINDOWS
};
