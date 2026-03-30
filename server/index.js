const http = require("node:http");
const { randomUUID } = require("node:crypto");
const {
  host,
  port,
  maxMedicalUploadBytes,
  maxMealScanBytes,
  maxRequestBodyBytes,
  maxVoiceUploadBytes,
  customFoodReviewUsageThreshold,
  adminEmails,
  mealLogPath,
  hydrationLogPath,
  mealPlansPath,
  workoutLogsPath,
  workoutExerciseCachePath,
  catalogOverridesPath,
  profileOverridesPath,
  medicalParserCachePath,
  customFoodsPath,
  favoritesPath,
  plannerCandidatesPath,
  reviewedPlannerMealsPath,
  usersPath,
  sessionsPath,
  medicalRecordsPath,
  uploadsDir,
  healthProfilePath,
  foodCsvPath,
  foundationFoodCsvPath,
  foodNutrientCsvPath,
  indianNutritionZipPath,
  indianMealsZipPath,
  fnddsMainFoodCsvPath,
  fnddsNutrientCsvPath
} = require("./config");
const { loadProfile, updateProfile } = require("./profile");
const { ensureStore, loadMealLogs, saveMealLogs } = require("./store");
const {
  ensureCacheFile,
  computeDocumentHash,
  getCachedMedicalParse,
  setCachedMedicalParse
} = require("./medical-parser-cache");
const {
  ensureAuthStores,
  registerUser,
  loginUser,
  getAuthenticatedUser,
  logoutSession,
  updateUserProfile
} = require("./auth");
const { searchFoods, loadFoodDetail } = require("./usda");
const { getIndianFoods, searchIndianFoods, loadIndianFoodDetail } = require("./indian-foods");
const { getFnddsMeals } = require("./fndds");
const {
  loadPlannerCandidates,
  recordPlannerFeedback,
  listPlannerCandidatesForReview,
  loadReviewedPlannerMeals,
  promotePlannerCandidate,
  rejectPlannerCandidate,
  buildPlannerFeedbackIndex
} = require("./planner-candidates");
const {
  getCuratedFoods,
  searchCuratedFoods,
  loadCuratedFoodDetail,
  listCuratedCatalogAudit,
  updateCuratedCatalogEntry
} = require("./local-food-catalog");
const { composeReviewedCatalogFood } = require("./reviewed-recipe-composer");
const { expandFoodSearchQueries, normalizeFoodSearchQuery } = require("./food-aliases");
const { lookupBarcodeProduct, buildBarcodeCandidates } = require("./barcode-provider");
const { fetchNearbyRestaurants, rankNearbyRestaurants } = require("./nearby-restaurants");
const { handleWearableRoutes } = require("./wearable-oauth");
const { handleWorkoutRoutes } = require("./workouts");
const {
  ensureJsonFile,
  listMedicalRecordsForUser,
  listMedicalRecordsForUserFast,
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord
} = require("./medical-records");
const { getMedicalRecordStatus } = require("./medical-utils");
const { sanitizeMedicalRecord } = require("./medical-utils");
const { enrichMedicationList } = require("./rxnorm");
const { extractTextContentIfPossible, extractTextContentDetailed, transcribeAudio, analyzeMealImage } = require("./openai");
const { persistUpload } = require("./object-storage");
const { isPostgresEnabled, query } = require("./postgres");
const { parseMedicalText } = require("./local-parser");
const { buildNutritionBrain } = require("./nutrition-brain");
const {
  parseMedicalRecordWithFallback,
  createRecommendationPlanWithFallback,
  chooseMealsWithFallback
} = require("./provider-chain");
const {
  parseMealTranscriptLocally,
  parseMultipleMealItems,
  transcribeAudioWithHuggingFace,
  buildVoiceSearchQueries
} = require("./voice-log");
const {
  dateKeyFromIso,
  computeLoggedNutrients,
  summarizeLogs,
  decorateFoodDetailWithPortionHints,
  getPortionOptions,
  normalizeQuantityForFood,
  buildMealBreakdown,
  buildWeeklySummary,
  buildRecentFoods,
  buildFavoriteFoods,
  createCustomFoodRecord,
  normalizeCustomFoodRecord,
  matchesFoodQuery
} = require("./food-log");
const { isRequestOriginAllowed, sendJson, sendOptions } = require("./http-utils");
const { enforceRateLimit } = require("./rate-limit");

ensureStore(mealLogPath);
ensureStore(hydrationLogPath);
ensureStore(mealPlansPath);
ensureStore(workoutLogsPath);
ensureStore(workoutExerciseCachePath);
ensureStore(catalogOverridesPath);
ensureStore(customFoodsPath);
ensureStore(favoritesPath);
ensureStore(plannerCandidatesPath);
ensureStore(reviewedPlannerMealsPath);
ensureCacheFile(medicalParserCachePath);
ensureJsonFile(medicalRecordsPath);
ensureAuthStores(usersPath, sessionsPath);

function sendNotFound(response) {
  sendJson(response, 404, { error: "Not found" });
}

function formatMb(bytes) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

function estimateBase64Bytes(base64) {
  const normalized = String(base64 || "").replace(/\s+/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function decodeBase64Payload(contentBase64, maxBytes, label) {
  const estimatedBytes = estimateBase64Bytes(contentBase64);
  if (!estimatedBytes) {
    throw new Error(`${label} is empty.`);
  }
  if (estimatedBytes > maxBytes) {
    throw new Error(`${label} exceeds the ${formatMb(maxBytes)} upload limit.`);
  }
  return Buffer.from(contentBase64, "base64");
}

function assertMimeAllowed(mimeType, allowedTypes, label) {
  const normalized = String(mimeType || "").toLowerCase();
  const isAllowed = allowedTypes.some((type) =>
    type.endsWith("/*") ? normalized.startsWith(type.slice(0, -1)) : normalized === type
  );
  if (!isAllowed) {
    throw new Error(`${label} type is not supported.`);
  }
}

function enforceRouteRateLimit(request, response, scope, limit, windowMs, userId = "") {
  const result = enforceRateLimit({ request, scope, limit, windowMs, userId });
  if (result.allowed) {
    return true;
  }

  response.setHeader("Retry-After", String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
  sendJson(response, 429, { error: "Too many requests. Please try again shortly." });
  return false;
}

function buildVoiceClarification(parsedItem, matches) {
  const query = String(parsedItem?.parsed?.foodQuery || "").trim();
  const portionUnit = String(parsedItem?.parsed?.portionUnit || "").trim().toLowerCase();

  if (!matches.length) {
    return query
      ? `I couldn't confidently match "${query}". Try a simpler name or tap this item to search manually.`
      : "I couldn't confidently match this item. Try a simpler name or search manually.";
  }

  if (
    portionUnit === "serving" &&
    /\b(dal|sambar|sabzi|subzi|curry|rajma|chole|chana masala|kadhi)\b/i.test(query)
  ) {
    return "This sounds like a bowl-style Indian dish. After loading it, switch the unit to katori if needed.";
  }

  if (portionUnit === "cup" && /\b(chai|tea|coffee|lassi|buttermilk)\b/i.test(query)) {
    return "Drink portions can vary. Adjust between cup and glass after loading if needed.";
  }

  return "";
}

function isIndianFoodId(id) {
  return typeof id === "string" && id.startsWith("indian-");
}

function isCustomFoodId(id) {
  return typeof id === "string" && id.startsWith("custom-");
}

function isReviewedCustomFoodId(id) {
  return typeof id === "string" && id.startsWith("reviewed-custom-");
}

function isCuratedFoodId(id) {
  return typeof id === "string" && id.startsWith("catalog-");
}

async function getCurrentUserProfile(authUser) {
  const medicalRecords = authUser ? await listMedicalRecordsForUser(medicalRecordsPath, authUser.id) : [];
  return await loadProfile(healthProfilePath, profileOverridesPath, medicalRecords, authUser);
}

function loadCustomFoods() {
  return loadMealLogs(customFoodsPath);
}

function saveCustomFoods(foods) {
  saveMealLogs(customFoodsPath, foods);
}

function loadFavorites() {
  return loadMealLogs(favoritesPath);
}

function saveFavorites(favorites) {
  saveMealLogs(favoritesPath, favorites);
}

async function loadCustomFoodsRuntime(userId = null) {
  if (!isPostgresEnabled()) {
    const foods = loadCustomFoods();
    const normalizedFoods = foods.map(normalizeCustomFoodRecord);
    return userId ? normalizedFoods.filter((food) => food.userId === userId) : normalizedFoods;
  }
  const result = await query(
    `
      SELECT raw
      FROM custom_foods
      ${userId ? "WHERE user_id = $1" : ""}
      ORDER BY description ASC
    `,
    userId ? [userId] : []
  );
  return result.rows.map((row) => normalizeCustomFoodRecord(row.raw));
}

async function upsertCustomFoodRuntime(food) {
  const normalizedFood = normalizeCustomFoodRecord(food);
  if (!isPostgresEnabled()) {
    const foods = loadCustomFoods();
    const existingIndex = foods.findIndex((item) => item.id === normalizedFood.id);
    if (existingIndex >= 0) {
      foods[existingIndex] = normalizedFood;
    } else {
      foods.push(normalizedFood);
    }
    saveCustomFoods(foods);
    return;
  }
  await query(
    `
      INSERT INTO custom_foods (id, user_id, description, barcode, raw)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        description = EXCLUDED.description,
        barcode = EXCLUDED.barcode,
        raw = EXCLUDED.raw
    `,
    [
      normalizedFood.id,
      normalizedFood.userId,
      normalizedFood.description || null,
      normalizedFood.barcode || null,
      JSON.stringify(normalizedFood)
    ]
  );
}

function isAdminUser(authUser) {
  return Boolean(authUser?.email && adminEmails.includes(String(authUser.email).toLowerCase()));
}

function requireAdminUser(authUser) {
  if (!isAdminUser(authUser)) {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }
}

async function updateCustomFoodRuntime(foodId, updater) {
  const foods = await loadCustomFoodsRuntime();
  const existing = foods.find((item) => item.id === foodId);
  if (!existing) {
    return null;
  }

  const updated = normalizeCustomFoodRecord(updater(existing));
  await upsertCustomFoodRuntime(updated);
  return updated;
}

async function incrementCustomFoodUsage(foodId, usedAt = new Date().toISOString()) {
  return updateCustomFoodRuntime(foodId, (food) => {
    const nextUsageCount = Number(food.usageCount || 0) + 1;
    const nextStatus =
      food.promotionStatus === "private" && nextUsageCount >= customFoodReviewUsageThreshold
        ? "review"
        : food.promotionStatus;

    return {
      ...food,
      usageCount: nextUsageCount,
      lastUsedAt: usedAt,
      promotionStatus: nextStatus
    };
  });
}

function buildPrivateCustomFoodSearchResult(food) {
  return {
    fdcId: `custom-${food.id}`,
    description: food.description,
    dataType: "custom_food",
    source: "custom",
    basis: food.basis,
    quantityUnit: food.quantityUnit,
    metadata: {
      ...(food.metadata || {}),
      customFoodOwnerId: food.userId,
      usageCount: Number(food.usageCount || 0),
      promotionStatus: food.promotionStatus,
      normalizedName: food.normalizedName || ""
    }
  };
}

function buildReviewedCustomCatalogSearchResult(food) {
  return {
    fdcId: `reviewed-custom-${food.id}`,
    description: food.description,
    dataType: "reviewed_custom_food",
    source: "reviewed_custom_catalog",
    basis: food.basis,
    quantityUnit: food.quantityUnit,
    metadata: {
      ...(food.metadata || {}),
      customFoodOwnerId: food.userId,
      usageCount: Number(food.usageCount || 0),
      promotionStatus: food.promotionStatus,
      normalizedName: food.normalizedName || "",
      reviewNotes: food.reviewNotes || "",
      catalogPromotedAt: food.catalogPromotedAt || food.reviewedAt || null,
      mappedSourceId: food.mappedSourceId || null
    }
  };
}

function buildCustomFoodDetailFromSearchResult(searchResult, nutrientsPer100g) {
  if (!searchResult) {
    return null;
  }

  return decorateFoodDetailWithPortionHints({
    fdcId: searchResult.fdcId,
    description: searchResult.description,
    dataType: searchResult.dataType,
    source: searchResult.source,
    basis: searchResult.basis,
    quantityUnit: searchResult.quantityUnit,
    metadata: searchResult.metadata,
    nutrientsPer100g
  });
}

function normalizePlannerMealText(value) {
  return String(value || "").trim().toLowerCase();
}

function inferPlannerMealTypeFromDatasetMeal(description, calories) {
  const text = normalizePlannerMealText(description);
  if (
    /(idli|dosa|upma|poha|pongal|uttapam|omelette|omelet|egg bhurji|oats|porridge|chilla|toast|paratha|breakfast)/.test(
      text
    )
  ) {
    return "breakfast";
  }
  if (
    /(chai|tea|coffee|chaat|bhel|pakora|vada|cutlet|ladoo|laddu|halwa|fruit|snack|biscuit|cookie|makhana|corn|sundal|cup|doi|yogurt|lassi)/.test(
      text
    )
  ) {
    return "snack";
  }
  if (/(soup|salad|stew)/.test(text) && Number(calories || 0) < 320) {
    return "dinner";
  }
  if (/(rice|biryani|pulao|curry|dal|rajma|roti|phulka|thali|plate|chawal|khichdi|sambar|fish|chicken|paneer)/.test(text)) {
    return Number(calories || 0) >= 420 ? "lunch" : "dinner";
  }
  if (Number(calories || 0) <= 220) {
    return "snack";
  }
  if (Number(calories || 0) <= 360) {
    return "breakfast";
  }
  return "lunch";
}

function isPlannerReadyIndianDatasetMeal(food) {
  const description = normalizePlannerMealText(food?.description);
  if (!description) {
    return false;
  }

  if (/^(rice|roti|naan|phulka|chapati|milk|tea|coffee|egg|dal|curd|yogurt|lassi|water)$/.test(description)) {
    return false;
  }

  if (description.split(/\s+/).length === 1 && !/(biryani|khichdi|upma|poha|halwa|chaat|korma|curry|posto|dalna|paturi|doi)/.test(description)) {
    return false;
  }

  const calories = Number(food?.nutrientsPer100g?.calories || 0);
  return calories > 0;
}

function isPlannerReadyFnddsMeal(food) {
  const description = normalizePlannerMealText(food?.description);
  const categoryDescription = normalizePlannerMealText(food?.metadata?.categoryDescription);
  const categoryText = `${description} ${categoryDescription}`;
  if (!description) {
    return false;
  }

  if (/^(milk|water|tea|coffee|eggnog|formula|buttermilk|cream|cheese|yogurt|butter|oil|rice|bread|apple|banana)$/.test(description)) {
    return false;
  }

  if (
    !/(sandwich|pizza|burger|burrito|taco|salad|soup|stew|curry|rice|pasta|noodle|omelet|omelette|scramble|bowl|plate|beans and rice|macaroni|lasagna|enchilada|quesadilla|meatloaf|casserole|fried rice|wrap|with )/.test(
      categoryText
    )
  ) {
    return false;
  }

  if (
    /(baby food|infant formula|topping from|sauce only|gravy only|broth only|beverage|milk|cream|cheese|pudding|beef excludes ground|pork|lamb|fish plain|shellfish plain|turkey plain|chicken plain|egg plain)/.test(
      categoryText
    )
  ) {
    return false;
  }

  if (
    /^(beef|meat|pork|fish|chicken|turkey|egg|eggs|ham|sausage|bacon|rice|bread|milk|cheese|yogurt|cream|apple|banana|orange|beans|lentils|pasta|noodles),?\s*(nfs|plain|whole|reduced fat|low fat|fat free|skim)?$/.test(
      description
    )
  ) {
    return false;
  }

  const calories = Number(food?.nutrientsPer100g?.calories || 0);
  return calories > 0;
}

async function buildCustomFoodReviewMatches(food) {
  const normalizedName = normalizeFoodSearchQuery(food?.normalizedName || food?.description || "");
  const verifiedMatches = (await searchAllFoods(normalizedName, food?.userId))
    .filter(
      (item) =>
        item.fdcId !== `custom-${food.id}` &&
        item.fdcId !== `reviewed-custom-${food.id}` &&
        item.source !== "custom" &&
        item.source !== "reviewed_custom_catalog"
    )
    .slice(0, 6);

  const duplicateCandidates = (await loadCustomFoodsRuntime())
    .filter(
      (item) =>
        item.id !== food.id &&
        item.promotionStatus !== "rejected" &&
        (item.normalizedName === normalizedName ||
          normalizeFoodSearchQuery(item.description).includes(normalizedName) ||
          normalizedName.includes(normalizeFoodSearchQuery(item.description)))
    )
    .sort((left, right) => (right.usageCount || 0) - (left.usageCount || 0))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      description: item.description,
      normalizedName: item.normalizedName,
      usageCount: item.usageCount || 0,
      promotionStatus: item.promotionStatus
    }));

  return {
    foodId: food.id,
    normalizedName,
    verifiedMatches,
    duplicateCandidates
  };
}

async function loadFavoritesRuntime(userId = null) {
  if (!isPostgresEnabled()) {
    const favorites = loadFavorites();
    return userId ? favorites.filter((favorite) => favorite.userId === userId) : favorites;
  }
  const result = await query(
    `
      SELECT raw
      FROM favorite_foods
      ${userId ? "WHERE user_id = $1" : ""}
    `,
    userId ? [userId] : []
  );
  return result.rows.map((row) => row.raw);
}

async function upsertFavoriteRuntime(favorite) {
  if (!isPostgresEnabled()) {
    const favorites = loadFavorites();
    const existingIndex = favorites.findIndex(
      (item) => item.userId === favorite.userId && item.foodId === favorite.foodId
    );
    if (existingIndex >= 0) {
      favorites[existingIndex] = favorite;
    } else {
      favorites.push(favorite);
    }
    saveFavorites(favorites);
    return;
  }
  await query(
    `
      INSERT INTO favorite_foods (user_id, food_id, raw)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (user_id, food_id)
      DO UPDATE SET raw = EXCLUDED.raw
    `,
    [favorite.userId, favorite.foodId, JSON.stringify(favorite)]
  );
}

async function deleteFavoriteRuntime(userId, foodId) {
  if (!isPostgresEnabled()) {
    const favorites = loadFavorites().filter((item) => !(item.userId === userId && item.foodId === foodId));
    saveFavorites(favorites);
    return;
  }
  await query("DELETE FROM favorite_foods WHERE user_id = $1 AND food_id = $2", [userId, foodId]);
}

async function searchAllFoods(query, authUserId) {
  const searchQueries = expandFoodSearchQueries(query);
  const deduped = new Map();
  const customFoods = await loadCustomFoodsRuntime();

  for (const searchQuery of searchQueries) {
    const [usdaFoods, indianFoods] = await Promise.all([
      searchFoods(foodCsvPath, foundationFoodCsvPath, searchQuery),
      Promise.resolve(searchIndianFoods(indianNutritionZipPath, indianMealsZipPath, searchQuery))
    ]);
    const curatedFoods = searchCuratedFoods(searchQuery, 16);
    const matchingPrivateCustomFoods = customFoods
      .filter(
        (food) =>
          matchesFoodQuery(food, searchQuery) &&
          food.userId === authUserId &&
          food.promotionStatus !== "approved" &&
          food.promotionStatus !== "rejected"
      )
      .map(buildPrivateCustomFoodSearchResult);
    const matchingReviewedCustomFoods = customFoods
      .filter((food) => matchesFoodQuery(food, searchQuery) && food.promotionStatus === "approved")
      .map(buildReviewedCustomCatalogSearchResult);

    for (const food of [
      ...matchingPrivateCustomFoods,
      ...matchingReviewedCustomFoods,
      ...curatedFoods,
      ...indianFoods,
      ...usdaFoods
    ]) {
      if (!food?.fdcId || deduped.has(food.fdcId)) {
        continue;
      }
      deduped.set(food.fdcId, food);
    }
  }

  const normalizedOriginal = normalizeFoodSearchQuery(query);
  return Array.from(deduped.values()).sort((left, right) => {
    const leftText = normalizeFoodSearchQuery(left.description);
    const rightText = normalizeFoodSearchQuery(right.description);
    const leftUsage = Number(left.metadata?.usageCount || 0);
    const rightUsage = Number(right.metadata?.usageCount || 0);
    const leftOwnerMatch = left.metadata?.customFoodOwnerId === authUserId ? 1 : 0;
    const rightOwnerMatch = right.metadata?.customFoodOwnerId === authUserId ? 1 : 0;

    if (leftText === normalizedOriginal && rightText !== normalizedOriginal) {
      return -1;
    }
    if (rightText === normalizedOriginal && leftText !== normalizedOriginal) {
      return 1;
    }
    if (leftText.startsWith(normalizedOriginal) && !rightText.startsWith(normalizedOriginal)) {
      return -1;
    }
    if (rightText.startsWith(normalizedOriginal) && !leftText.startsWith(normalizedOriginal)) {
      return 1;
    }
    if (leftOwnerMatch !== rightOwnerMatch) {
      return rightOwnerMatch - leftOwnerMatch;
    }
    if (leftUsage !== rightUsage) {
      return rightUsage - leftUsage;
    }
    return 0;
  });
}

async function loadFoodAnySource(fdcId) {
  if (isReviewedCustomFoodId(fdcId)) {
    const reviewedCustomFood = (await loadCustomFoodsRuntime()).find((item) => `reviewed-custom-${item.id}` === fdcId);
    if (!reviewedCustomFood || reviewedCustomFood.promotionStatus !== "approved") {
      return null;
    }

    return buildCustomFoodDetailFromSearchResult(
      buildReviewedCustomCatalogSearchResult(reviewedCustomFood),
      reviewedCustomFood.nutrientsPer100g
    );
  }

  if (isCustomFoodId(fdcId)) {
    const customFood = (await loadCustomFoodsRuntime()).find((item) => `custom-${item.id}` === fdcId);
    if (!customFood) {
      return null;
    }

    return buildCustomFoodDetailFromSearchResult(buildPrivateCustomFoodSearchResult(customFood), customFood.nutrientsPer100g);
  }

  if (isCuratedFoodId(fdcId)) {
    const curatedFood = loadCuratedFoodDetail(fdcId);
    if (!curatedFood) {
      return null;
    }

    const { food } = await composeReviewedCatalogFood(curatedFood, async (foodRef) => {
      const refId = String(foodRef?.fdcId || foodRef?.id || "").trim();
      if (!refId) {
        return null;
      }
      if (refId === curatedFood.id) {
        return null;
      }
      if (isCuratedFoodId(refId)) {
        return loadCuratedFoodDetail(refId);
      }
      if (isReviewedCustomFoodId(refId)) {
        const reviewedCustomFood = (await loadCustomFoodsRuntime()).find((item) => `reviewed-custom-${item.id}` === refId);
        return reviewedCustomFood
          ? buildCustomFoodDetailFromSearchResult(
              buildReviewedCustomCatalogSearchResult(reviewedCustomFood),
              reviewedCustomFood.nutrientsPer100g
            )
          : null;
      }
      if (isCustomFoodId(refId)) {
        const customFood = (await loadCustomFoodsRuntime()).find((item) => `custom-${item.id}` === refId);
        return customFood
          ? buildCustomFoodDetailFromSearchResult(buildPrivateCustomFoodSearchResult(customFood), customFood.nutrientsPer100g)
          : null;
      }
      if (isIndianFoodId(refId)) {
        return loadIndianFoodDetail(indianNutritionZipPath, indianMealsZipPath, refId);
      }
      return loadFoodDetail(foodCsvPath, foodNutrientCsvPath, refId);
    });

    return decorateFoodDetailWithPortionHints(food);
  }

  return decorateFoodDetailWithPortionHints(
    isIndianFoodId(fdcId)
      ? loadIndianFoodDetail(indianNutritionZipPath, indianMealsZipPath, fdcId)
      : loadFoodDetail(foodCsvPath, foodNutrientCsvPath, fdcId)
  );
}

function round(value) {
  return Number(value.toFixed(2));
}

async function transcribeVoiceMeal({ filename, mimeType, buffer }) {
  const errors = [];

  if (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY) {
    try {
      const transcript = await transcribeAudioWithHuggingFace({ filename, mimeType, buffer });
      return {
        transcript,
        provider: "huggingface"
      };
    } catch (error) {
      errors.push(`huggingface: ${error.message}`);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const transcript = await transcribeAudio({ filename, mimeType, buffer });
      return {
        transcript,
        provider: "openai"
      };
    } catch (error) {
      errors.push(`openai: ${error.message}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `Voice transcription failed. ${errors.join(" | ")}`
      : "Voice transcription is not configured. Set HF_TOKEN for the free path or OPENAI_API_KEY as fallback."
  );
}

async function loadMealLogsRuntime() {
  if (!isPostgresEnabled()) {
    return loadMealLogs(mealLogPath);
  }
  const result = await query(
    `
      SELECT raw
      FROM meal_logs
      ORDER BY consumed_at DESC NULLS LAST
    `
  );
  return result.rows.map((row) => row.raw);
}

async function loadMealLogsForUserRuntime(userId) {
  if (!isPostgresEnabled()) {
    return loadMealLogs(mealLogPath).filter((log) => log.userId === userId);
  }
  const result = await query(
    `
      SELECT raw
      FROM meal_logs
      WHERE user_id = $1
      ORDER BY consumed_at DESC NULLS LAST
    `,
    [userId]
  );
  return result.rows.map((row) => row.raw);
}

async function loadMealLogsForDateRuntime(userId, date) {
  const logs = await loadMealLogsForUserRuntime(userId);
  return logs.filter((log) => log.date === date);
}

async function saveMealLogsRuntime(logs) {
  if (!isPostgresEnabled()) {
    saveMealLogs(mealLogPath, logs);
    return;
  }

  await query("BEGIN");
  try {
    await query("TRUNCATE TABLE meal_logs");
    for (const log of logs) {
      await query(
        `
          INSERT INTO meal_logs (id, user_id, meal_type, consumed_at, raw)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [log.id, log.userId, log.mealType || null, log.consumedAt || null, JSON.stringify(log)]
      );
    }
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

async function upsertMealLogRuntime(log) {
  if (!isPostgresEnabled()) {
    const logs = loadMealLogs(mealLogPath);
    const existingIndex = logs.findIndex((item) => item.id === log.id);
    if (existingIndex >= 0) {
      logs[existingIndex] = log;
    } else {
      logs.push(log);
    }
    saveMealLogs(mealLogPath, logs);
    return;
  }

  await query(
    `
      INSERT INTO meal_logs (id, user_id, meal_type, consumed_at, raw)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        meal_type = EXCLUDED.meal_type,
        consumed_at = EXCLUDED.consumed_at,
        raw = EXCLUDED.raw
    `,
    [log.id, log.userId, log.mealType || null, log.consumedAt || null, JSON.stringify(log)]
  );
}

async function deleteMealLogRuntime(logId, userId) {
  if (!isPostgresEnabled()) {
    const logs = loadMealLogs(mealLogPath);
    const index = logs.findIndex((item) => item.id === logId && item.userId === userId);
    if (index < 0) {
      return null;
    }
    const [removed] = logs.splice(index, 1);
    saveMealLogs(mealLogPath, logs);
    return removed;
  }

  const result = await query(
    `
      DELETE FROM meal_logs
      WHERE id = $1 AND user_id = $2
      RETURNING raw
    `,
    [logId, userId]
  );
  return result.rows[0]?.raw || null;
}

async function loadMealPlans() {
  if (!isPostgresEnabled()) {
    return loadMealLogs(mealPlansPath);
  }
  const result = await query(
    `
      SELECT raw
      FROM meal_plans
      ORDER BY plan_date DESC NULLS LAST, updated_at DESC NULLS LAST
    `
  );
  return result.rows.map((row) => row.raw);
}

async function loadMealPlansForUser(userId, days = null) {
  const plans = await loadMealPlans();
  const sorted = plans
    .filter((plan) => plan.userId === userId)
    .sort((left, right) => right.planDate.localeCompare(left.planDate));
  if (days && Number.isFinite(days) && days > 0) {
    return sorted.slice(0, days);
  }
  return sorted;
}

async function getMealPlanForUserDate(userId, planDate) {
  const plans = await loadMealPlansForUser(userId);
  return plans.find((plan) => plan.planDate === planDate) || null;
}

async function saveMealPlans(plans) {
  if (!isPostgresEnabled()) {
    saveMealLogs(mealPlansPath, plans);
    return;
  }

  await query("BEGIN");
  try {
    await query("TRUNCATE TABLE meal_plans");
    for (const plan of plans) {
      await query(
        `
          INSERT INTO meal_plans (id, user_id, plan_date, updated_at, raw)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          plan.id,
          plan.userId,
          plan.planDate || null,
          plan.updatedAt || plan.createdAt || null,
          JSON.stringify(plan)
        ]
      );
    }
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

async function upsertMealPlan(plan) {
  if (!isPostgresEnabled()) {
    const plans = loadMealLogs(mealPlansPath);
    const existingIndex = plans.findIndex((item) => item.id === plan.id || (item.userId === plan.userId && item.planDate === plan.planDate));
    if (existingIndex >= 0) {
      plans[existingIndex] = plan;
    } else {
      plans.push(plan);
    }
    saveMealLogs(mealPlansPath, plans);
    return;
  }

  await query(
    `
      INSERT INTO meal_plans (id, user_id, plan_date, updated_at, raw)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        plan_date = EXCLUDED.plan_date,
        updated_at = EXCLUDED.updated_at,
        raw = EXCLUDED.raw
    `,
    [
      plan.id,
      plan.userId,
      plan.planDate || null,
      plan.updatedAt || plan.createdAt || null,
      JSON.stringify(plan)
    ]
  );
}

async function clearMealPlansForUser(userId) {
  if (isPostgresEnabled()) {
    await query("DELETE FROM meal_plans WHERE user_id = $1", [userId]);
    return [];
  }
  const plans = await loadMealPlans();
  const kept = plans.filter((plan) => plan.userId !== userId);
  if (kept.length !== plans.length) {
    await saveMealPlans(kept);
  }
  return kept;
}

function loadHydrationLogs() {
  return loadMealLogs(hydrationLogPath);
}

function saveHydrationLogs(logs) {
  saveMealLogs(hydrationLogPath, logs);
}

async function loadHydrationLogsRuntime(userId = null) {
  if (!isPostgresEnabled()) {
    const logs = loadHydrationLogs();
    return userId ? logs.filter((log) => log.userId === userId) : logs;
  }
  const result = await query(
    `
      SELECT raw
      FROM hydration_logs
      ${userId ? "WHERE user_id = $1" : ""}
      ORDER BY logged_at DESC NULLS LAST
    `,
    userId ? [userId] : []
  );
  return result.rows.map((row) => row.raw);
}

async function upsertHydrationLogRuntime(log) {
  if (!isPostgresEnabled()) {
    const logs = loadHydrationLogs();
    const existingIndex = logs.findIndex((item) => item.id === log.id);
    if (existingIndex >= 0) {
      logs[existingIndex] = log;
    } else {
      logs.push(log);
    }
    saveHydrationLogs(logs);
    return;
  }
  await query(
    `
      INSERT INTO hydration_logs (id, user_id, logged_at, raw)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        logged_at = EXCLUDED.logged_at,
        raw = EXCLUDED.raw
    `,
    [log.id, log.userId, log.loggedAt || null, JSON.stringify(log)]
  );
}

async function deleteHydrationLogRuntime(logId, userId) {
  if (!isPostgresEnabled()) {
    const logs = loadHydrationLogs();
    const index = logs.findIndex((item) => item.id === logId && item.userId === userId);
    if (index < 0) {
      return null;
    }
    const [removed] = logs.splice(index, 1);
    saveHydrationLogs(logs);
    return removed;
  }

  const result = await query(
    `
      DELETE FROM hydration_logs
      WHERE id = $1 AND user_id = $2
      RETURNING raw
    `,
    [logId, userId]
  );
  return result.rows[0]?.raw || null;
}

function calculateWaterTargetMl(profile) {
  const weightKg = Number(profile?.weightKg || 0);
  const activityLevel = String(profile?.activityLevel || "").toLowerCase();
  const baseTarget = weightKg > 0 ? weightKg * 35 : 2500;
  const activityBoost =
    activityLevel.includes("very") || activityLevel.includes("active")
      ? 500
      : activityLevel.includes("moderate")
        ? 250
        : 0;

  return Math.round(Math.max(1800, Math.min(baseTarget + activityBoost, 4500)));
}

async function collectRecommendationCandidates(plan, authUserId) {
  const candidateMap = new Map();
  for (const query of plan.searchQueries || []) {
    const results = await searchAllFoods(query, authUserId);
    for (const result of results.slice(0, 10)) {
      if (!candidateMap.has(result.fdcId)) {
        const detail = await loadFoodAnySource(result.fdcId);
        if (detail) {
          candidateMap.set(result.fdcId, detail);
        }
      }
    }
  }

  return Array.from(candidateMap.values()).slice(0, 48);
}

function getMealCalorieTarget(profile, mealType) {
  const dailyTarget = Number(profile?.dailyCalorieTarget || 2000);
  const distribution = {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.28,
    snack: 0.12
  };

  return round(dailyTarget * (distribution[mealType] || 0.25));
}

function roundPlanQuantity(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  if (value < 1) {
    return Math.max(0.5, Math.round(value * 4) / 4);
  }

  if (value <= 3) {
    return Math.round(value * 4) / 4;
  }

  return Math.round(value * 2) / 2;
}

function choosePlanPortion(foodDetail, targetCalories) {
  const options = getPortionOptions(foodDetail);
  const preferred =
    options.find((option) => option.unit === "serving") ||
    options.find((option) => option.unit === "piece") ||
    options.find((option) => option.unit === "cup") ||
    options[0] || { unit: foodDetail?.basis === "per_serving" ? "serving" : "g", label: "Serving" };

  const singlePortion = normalizeQuantityForFood(foodDetail, 1, preferred.unit);
  const singlePortionNutrients = computeLoggedNutrients(foodDetail, singlePortion.effectiveQuantity);
  const portionCalories = Number(singlePortionNutrients.calories || 0);
  const rawQuantity =
    targetCalories && portionCalories > 0
      ? targetCalories / portionCalories
      : 1;
  const quantity = roundPlanQuantity(Math.max(rawQuantity, preferred.unit === "g" ? 0.5 : 1));
  const normalized = normalizeQuantityForFood(foodDetail, quantity, preferred.unit);

  return {
    quantity,
    portionUnit: normalized.portionUnit,
    portionLabel: normalized.portionLabel,
    effectiveQuantity: normalized.effectiveQuantity,
    targetCalories: targetCalories || portionCalories
  };
}

function formatMealTypeLabel(mealType) {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getMealRotationSeed(planDate, mealType) {
  const source = `${planDate}:${mealType}`;
  let total = 0;
  for (const character of source) {
    total += character.charCodeAt(0);
  }
  return total;
}

function chooseRotatedRecommendation({ recommendations, recentPlanTitles = [], planDate, mealType }) {
  const normalizedRecentTitles = new Set(recentPlanTitles.map(normalizeTitle).filter(Boolean));
  const deduped = [];
  const seenTitles = new Set();

  for (const recommendation of recommendations || []) {
    const normalized = normalizeTitle(recommendation?.title);
    if (!normalized || seenTitles.has(normalized)) {
      continue;
    }
    seenTitles.add(normalized);
    deduped.push(recommendation);
  }

  if (deduped.length === 0) {
    return { chosen: null, alternatives: [] };
  }

  const freshCandidates = deduped.filter(
    (recommendation) => !normalizedRecentTitles.has(normalizeTitle(recommendation.title))
  );
  const selectionPool = freshCandidates.length > 0 ? freshCandidates : deduped;
  const rotationWindow = selectionPool.slice(0, Math.min(selectionPool.length, 4));
  const rotationSeed = getMealRotationSeed(planDate, mealType);
  const chosenIndex = rotationWindow.length > 0 ? rotationSeed % rotationWindow.length : 0;
  const chosen = rotationWindow[chosenIndex] || selectionPool[0];
  const chosenTitle = normalizeTitle(chosen?.title);
  const alternatives = selectionPool
    .filter((recommendation) => normalizeTitle(recommendation.title) !== chosenTitle)
    .slice(0, 3);

  return { chosen, alternatives };
}

function summarizeMedicalContext(records) {
  return records.reduce(
    (accumulator, record) => {
      const status = record.status || getMedicalRecordStatus(record.extracted);
      if (status === "parsed") {
        accumulator.statuses.parsed += 1;
      } else if (status === "needs_review") {
        accumulator.statuses.needsReview += 1;
      } else {
        accumulator.statuses.lowConfidence += 1;
      }
      accumulator.recordCount += 1;
      return accumulator;
    },
    {
      recordCount: 0,
      statuses: {
        parsed: 0,
        needsReview: 0,
        lowConfidence: 0
      }
    }
  );
}

function buildMedicalContextSignature(records) {
  return (records || [])
    .map((record) =>
      [
        record.id,
        record.uploadedAt || "",
        record.status || "",
        record.extracted?.recordDate || "",
        record.extracted?.confidence ?? "",
        (record.extracted?.diagnoses || []).join("|"),
        (record.extracted?.medications || []).join("|")
      ].join("::")
    )
    .sort()
    .join("##");
}

function buildAiNotes({ medicalRecords, mealResults, userPrompt }) {
  const priorities = Array.from(
    new Set(mealResults.flatMap((item) => item.plan.nutritionPriorities || []))
  );
  const avoidTerms = Array.from(
    new Set(mealResults.flatMap((item) => item.plan.avoidTerms || []))
  );
  const safeStatuses = summarizeMedicalContext(medicalRecords);

  const notes = [];
  if (userPrompt) {
    notes.push(`Built around your request: "${userPrompt}".`);
  }
  if (medicalRecords.length > 0) {
    notes.push(
      `Used ${safeStatuses.recordCount} medical record(s): ${safeStatuses.statuses.parsed} parsed, ${safeStatuses.statuses.needsReview} need review, ${safeStatuses.statuses.lowConfidence} low-confidence.`
    );
  }
  if (priorities.length > 0) {
    notes.push(`Applied priorities: ${priorities.slice(0, 5).join(", ")}.`);
  }
  if (avoidTerms.length > 0) {
    notes.push(`Reduced foods matching: ${avoidTerms.slice(0, 6).join(", ")}.`);
  }

  return notes.join(" ");
}

async function getRecentPlannedTitles(authUserId, mealType, limit = 8) {
  const plans = await loadMealPlansForUser(authUserId);
  return plans
    .flatMap((plan) => (plan.meals || []).filter((meal) => !mealType || meal.mealType === mealType))
    .map((meal) => String(meal.title || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function inferCurrentMealType() {
  const hour = new Date().getHours();
  if (hour < 11) {
    return "breakfast";
  }
  if (hour < 15) {
    return "lunch";
  }
  if (hour < 18) {
    return "snack";
  }
  return "dinner";
}

function buildRecipeForMeal(detail, mealType) {
  const title = String(detail?.description || "").toLowerCase();

  if (/omelette|egg/.test(title)) {
    return {
      ingredients: ["2 eggs", "1 tsp oil", "salt to taste", "pepper", "optional vegetables"],
      instructions: [
        "Beat the eggs with pepper and optional chopped vegetables.",
        "Heat a pan with a small amount of oil.",
        "Pour the mixture and cook until set on both sides."
      ]
    };
  }

  if (/oats/.test(title)) {
    return {
      ingredients: ["1 serving oats", "water or milk", "nuts or seeds", "optional fruit"],
      instructions: [
        "Cook oats with water or milk until soft.",
        "Top with nuts or seeds.",
        "Add fruit if it fits your health target."
      ]
    };
  }

  if (/paneer bhurji|paneer/.test(title)) {
    return {
      ingredients: ["paneer", "onion", "tomato", "spices", "1 tsp oil"],
      instructions: [
        "Saute onion and tomato with a small amount of oil.",
        "Add spices and crumble in the paneer.",
        "Cook briefly and serve hot."
      ]
    };
  }

  if (/sprout|chana chaat|chana/.test(title)) {
    return {
      ingredients: ["sprouts or chana", "onion", "tomato", "lemon", "spices"],
      instructions: [
        "Combine the cooked sprouts or chana with chopped vegetables.",
        "Season with lemon and mild spices.",
        "Serve fresh."
      ]
    };
  }

  if (/dosa|idli|upma|poha|khichdi|rajma|dal|palak paneer|curd rice/.test(title)) {
    return {
      ingredients: ["Use your usual home-style ingredients for this dish", "Keep oil and salt moderate"],
      instructions: [
        "Prepare the dish in a home-style way using a moderate amount of oil and salt.",
        "Adjust the portion to match the suggested serving size on this plan."
      ]
    };
  }

  if (mealType === "snack") {
    return {
      ingredients: ["1 planned snack portion"],
      instructions: [
        "Prepare or serve the snack in the suggested portion.",
        "Pair with water or unsweetened tea if appropriate."
      ]
    };
  }

  return null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildManualReadingsRecord(readings = {}) {
  const labs = [];
  const vitals = [];
  const diagnoses = [];
  const dietaryFlags = [];

  function addLab(name, value, unit, interpretation = null) {
    if (value === null || value === undefined || value === "") {
      return;
    }
    labs.push({
      name,
      value,
      unit: unit || null,
      referenceRange: null,
      interpretation,
      observedAt: new Date().toISOString()
    });
  }

  function addVital(name, value, unit) {
    if (value === null || value === undefined || value === "") {
      return;
    }
    vitals.push({
      name,
      value,
      unit: unit || null,
      observedAt: new Date().toISOString()
    });
  }

  const hba1c = toNumberOrNull(readings.hba1c);
  const fastingGlucose = toNumberOrNull(readings.fastingGlucose);
  const randomGlucose = toNumberOrNull(readings.randomGlucose);
  const cholesterol = toNumberOrNull(readings.totalCholesterol);
  const ldl = toNumberOrNull(readings.ldl);
  const hdl = toNumberOrNull(readings.hdl);
  const triglycerides = toNumberOrNull(readings.triglycerides);
  const hemoglobin = toNumberOrNull(readings.hemoglobin);
  const ferritin = toNumberOrNull(readings.ferritin);
  const creatinine = toNumberOrNull(readings.creatinine);
  const urea = toNumberOrNull(readings.urea);
  const tsh = toNumberOrNull(readings.tsh);
  const vitaminD = toNumberOrNull(readings.vitaminD);
  const vitaminB12 = toNumberOrNull(readings.vitaminB12);
  const uricAcid = toNumberOrNull(readings.uricAcid);
  const systolic = toNumberOrNull(readings.systolicBp);
  const diastolic = toNumberOrNull(readings.diastolicBp);
  const weightKg = toNumberOrNull(readings.weightKg);
  const bmi = toNumberOrNull(readings.bmi);

  addLab("HbA1c", hba1c, "%");
  addLab("Blood Glucose", fastingGlucose, "mg/dL");
  addLab("Random Blood Glucose", randomGlucose, "mg/dL");
  addLab("Total Cholesterol", cholesterol, "mg/dL");
  addLab("LDL Cholesterol", ldl, "mg/dL");
  addLab("HDL Cholesterol", hdl, "mg/dL");
  addLab("Triglycerides", triglycerides, "mg/dL");
  addLab("Hemoglobin", hemoglobin, "g/dL");
  addLab("Ferritin", ferritin, "ng/mL");
  addLab("Creatinine", creatinine, "mg/dL");
  addLab("Urea", urea, "mg/dL");
  addLab("TSH", tsh, "mIU/L");
  addLab("Vitamin D", vitaminD, "ng/mL");
  addLab("Vitamin B12", vitaminB12, "pg/mL");
  addLab("Uric Acid", uricAcid, "mg/dL");
  addLab("BMI", bmi, "kg/m2");

  if (systolic !== null || diastolic !== null) {
    addVital("Blood Pressure", [systolic, diastolic].filter((value) => value !== null).join("/"), "mmHg");
  }
  addVital("Weight", weightKg, "kg");

  if ((hba1c !== null && hba1c >= 5.7) || (fastingGlucose !== null && fastingGlucose >= 100) || (randomGlucose !== null && randomGlucose >= 140)) {
    diagnoses.push("glucose dysregulation");
    dietaryFlags.push("prioritize_lower_glycemic_load");
  }
  if ((cholesterol !== null && cholesterol >= 200) || (ldl !== null && ldl >= 130) || (triglycerides !== null && triglycerides >= 150)) {
    diagnoses.push("dyslipidemia");
    dietaryFlags.push("prefer_heart_healthy_fats");
  }
  if ((systolic !== null && systolic >= 130) || (diastolic !== null && diastolic >= 80)) {
    diagnoses.push("hypertension");
    dietaryFlags.push("prefer_lower_sodium_meals");
  }
  if ((hemoglobin !== null && hemoglobin < 12) || (ferritin !== null && ferritin < 30)) {
    diagnoses.push("anemia risk");
    dietaryFlags.push("support_iron_intake");
  }
  if ((creatinine !== null && creatinine > 1.2) || (urea !== null && urea > 40) || (uricAcid !== null && uricAcid > 7)) {
    diagnoses.push("kidney strain risk");
    dietaryFlags.push("monitor_kidney_friendly_meals");
  }
  if (tsh !== null && (tsh < 0.4 || tsh > 4.5)) {
    diagnoses.push("thyroid imbalance");
    dietaryFlags.push("monitor_thyroid_related_nutrition");
  }
  if (vitaminD !== null && vitaminD < 20) {
    diagnoses.push("vitamin d deficiency risk");
  }
  if (vitaminB12 !== null && vitaminB12 < 220) {
    diagnoses.push("vitamin b12 deficiency risk");
  }
  if (bmi !== null && bmi >= 25) {
    dietaryFlags.push("steady_energy");
  }

  return {
    id: `manual-${randomUUID()}`,
    userId: "manual",
    filename: "Manual readings",
    mimeType: "application/json",
    uploadedAt: new Date().toISOString(),
    storedPath: "",
    status: "parsed",
    extracted: {
      provider: "manual_readings",
      confidence: 0.95,
      summary: "Clinical context built from manually entered readings.",
      recordDate: dateKeyFromIso(new Date()),
      diagnoses,
      medications: [],
      allergies: [],
      dietaryFlags,
      labResults: labs,
      vitals
    }
  };
}

async function generateSavedMealPlanWithMedicalRecords({ authUser, planDate, userPrompt, medicalRecords }) {
  const profile = await getCurrentUserProfile(authUser);
  const recentLogs = (await loadMealLogsForUserRuntime(authUser.id))
    .sort((left, right) => left.consumedAt.localeCompare(right.consumedAt))
    .slice(-30);

  const mealPrompts = [
    ["breakfast", `Plan a breakfast for ${planDate}. ${userPrompt || "Keep it practical, health-aware, and realistic."}`],
    ["lunch", `Plan a lunch for ${planDate}. ${userPrompt || "Keep it practical, health-aware, and realistic."}`],
    ["dinner", `Plan a dinner for ${planDate}. ${userPrompt || "Keep it practical, health-aware, and realistic."}`],
    ["snack", `Plan a snack for ${planDate}. ${userPrompt || "Keep it practical, health-aware, and realistic."}`]
  ];

  const mealResults = [];

  for (const [mealType, prompt] of mealPrompts) {
    const mealCalorieTarget = getMealCalorieTarget(profile, mealType);
    const recentPlanTitles = await getRecentPlannedTitles(authUser.id, mealType);
    const plan = {
      ...(await createRecommendationPlanWithFallback({
        profile,
        medicalRecords,
        userPrompt: prompt,
        recentLogs,
        recentPlanTitles
      })),
      userId: authUser.id
    };
    const candidates = await collectRecommendationCandidates(plan, authUser.id);
    const recommendation = await chooseMealsWithFallback({
      profile,
      medicalRecords,
      userPrompt: prompt,
      candidates,
      plan
    });
    const usableRecommendations = recommendation.recommendations || [];
    const { chosen, alternatives } = chooseRotatedRecommendation({
      recommendations: usableRecommendations,
      recentPlanTitles,
      planDate,
      mealType
    });
    if (!chosen) {
      continue;
    }
    const detail = candidates.find((candidate) => candidate.fdcId === chosen.foodId);
    if (!detail) {
      continue;
    }
    const portion = choosePlanPortion(detail, mealCalorieTarget);
    const nutrients = computeLoggedNutrients(detail, portion.effectiveQuantity);
    mealResults.push({
      mealType,
      plan,
      chosen,
      alternatives,
      candidates,
      detail,
      portion,
      nutrients
    });
  }

  const totals = mealResults.reduce(
    (accumulator, item) => {
      accumulator.calories += item.nutrients.calories || 0;
      accumulator.protein += item.nutrients.protein || 0;
      accumulator.carbs += item.nutrients.carbs || 0;
      accumulator.fat += item.nutrients.fat || 0;
      return accumulator;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    id: randomUUID(),
    userId: authUser.id,
    planDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userPrompt: userPrompt || "Generate a balanced meal plan.",
    provider: mealResults[0]?.plan?.provider || "local",
    aiNotes: buildAiNotes({ medicalRecords, mealResults, userPrompt }),
    totals: {
      calories: round(totals.calories),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat)
    },
    medicalContext: summarizeMedicalContext(medicalRecords),
    medicalContextSignature: buildMedicalContextSignature(medicalRecords),
    meals: mealResults.map((item) => ({
      mealType: item.mealType,
      title: item.chosen.title || item.detail.description,
      description: `${formatMealTypeLabel(item.mealType)} sized toward a ${item.portion.targetCalories} kcal target using your saved health profile and medical updates.`,
      calories: item.nutrients.calories,
      protein: item.nutrients.protein,
      carbs: item.nutrients.carbs,
      fat: item.nutrients.fat,
      servingSuggestion: `${item.portion.quantity} ${item.portion.portionLabel} (target ${item.portion.targetCalories} kcal). ${item.chosen.servingSuggestion}`,
      whyItFits: item.chosen.whyItFits,
      cautions: item.chosen.cautions || [],
      foodId: item.detail.fdcId,
      recipe: buildRecipeForMeal(item.detail, item.mealType),
      alternatives: item.alternatives
        .map((alternative) => {
          const alternativeDetail = item.candidates.find((candidate) => candidate.fdcId === alternative.foodId);
          if (!alternativeDetail) {
            return null;
          }
          const alternativePortion = choosePlanPortion(alternativeDetail, item.portion.targetCalories);
          const alternativeNutrients = computeLoggedNutrients(alternativeDetail, alternativePortion.effectiveQuantity);
          return {
            title: alternative.title || alternativeDetail.description,
            calories: alternativeNutrients.calories,
            protein: alternativeNutrients.protein,
            carbs: alternativeNutrients.carbs,
            fat: alternativeNutrients.fat,
            servingSuggestion: `${alternativePortion.quantity} ${alternativePortion.portionLabel} (target ${alternativePortion.targetCalories} kcal). ${alternative.servingSuggestion}`,
            whyItFits: alternative.whyItFits,
            cautions: alternative.cautions || [],
            foodId: alternativeDetail.fdcId,
            recipe: buildRecipeForMeal(alternativeDetail, item.mealType)
          };
        })
        .filter(Boolean)
    }))
  };
}

async function generateSavedMealPlan({ authUser, planDate, userPrompt }) {
  const medicalRecords = await listMedicalRecordsForUserFast(medicalRecordsPath, authUser.id);
  return generateSavedMealPlanWithMedicalRecords({
    authUser,
    planDate,
    userPrompt,
    medicalRecords
  });
}

async function refreshStaleMealPlansForUser({ authUser, plans, days = 14 }) {
  const currentMedicalRecords = await listMedicalRecordsForUserFast(medicalRecordsPath, authUser.id);
  const currentSignature = buildMedicalContextSignature(currentMedicalRecords);
  const visiblePlanIds = new Set(
    (await loadMealPlansForUser(authUser.id, Number.isFinite(days) && days > 0 ? days : 14)).map((plan) => plan.id)
  );
  let changed = false;
  const refreshedPlans = [];

  for (const plan of plans) {
    if (plan.userId !== authUser.id) {
      refreshedPlans.push(plan);
      continue;
    }

    if (!visiblePlanIds.has(plan.id) || plan.medicalContextSignature === currentSignature) {
      refreshedPlans.push(plan);
      continue;
    }
    // Medical records changed after this plan was saved. Drop the stale cached plan
    // so the UI can prompt for a fresh generation instead of blocking on regeneration
    // during a read request.
    changed = true;
  }

  if (changed) {
    await saveMealPlans(refreshedPlans);
  }

  return refreshedPlans;
}

async function buildNearbyMealContext({ authUser, planDate, mealType }) {
  const profile = await getCurrentUserProfile(authUser);
  const medicalRecords = await listMedicalRecordsForUserFast(medicalRecordsPath, authUser.id);
  const recentLogs = (await loadMealLogsForUserRuntime(authUser.id))
    .sort((left, right) => left.consumedAt.localeCompare(right.consumedAt))
    .slice(-20);
  const normalizedMealType = mealType || inferCurrentMealType();
  const savedPlan = await getMealPlanForUserDate(authUser.id, planDate);
  const plannedMeal = savedPlan?.meals?.find((item) => item.mealType === normalizedMealType) || null;
  const prompt = plannedMeal
    ? `Find a nearby ${normalizedMealType} option similar to ${plannedMeal.title}. ${plannedMeal.whyItFits}`
    : `Find a nearby ${normalizedMealType} that fits my diet plan and medical needs.`;
  const plan = await createRecommendationPlanWithFallback({
    profile,
    medicalRecords,
    userPrompt: prompt,
    recentLogs,
      recentPlanTitles: await getRecentPlannedTitles(authUser.id, normalizedMealType)
  });

  return {
    plan,
    meal: plannedMeal || {
      mealType: normalizedMealType,
      title: `${formatMealTypeLabel(normalizedMealType)} nearby option`,
      description: `Nearby ${normalizedMealType} picked to stay close to your medical-aware plan.`,
      whyItFits: `Uses priorities: ${(plan.nutritionPriorities || []).slice(0, 3).join(", ") || "general balance"}.`
    },
    profile,
    medicalRecords
  };
}

function scoreVoiceFoodMatch(food, queries) {
  const text = String(food?.description || "").toLowerCase();
  const metadataText = Object.values(food?.metadata || {})
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  const haystack = `${text} ${metadataText}`.trim();
  let score = 0;

  for (const query of queries) {
    const normalized = String(query || "").toLowerCase();
    if (!normalized) {
      continue;
    }
    if (text === normalized) {
      score += 12;
      continue;
    }
    if (text.startsWith(normalized)) {
      score += 8;
    }
    if (haystack.includes(normalized)) {
      score += 5;
    }

    const queryTokens = normalized.split(/\s+/).filter(Boolean);
    const matchedTokens = queryTokens.filter((token) => haystack.includes(token));
    score += matchedTokens.length;
  }

  if (food?.source === "custom") {
    score += 1;
  }

  return score;
}

async function searchVoiceFoodMatches(parsedItem, authUserId) {
  const queries = buildVoiceSearchQueries(parsedItem);
  const queryResults = await Promise.all(queries.map((query) => searchAllFoods(query, authUserId)));
  const deduped = new Map();

  queryResults.flat().forEach((item) => {
    if (!deduped.has(item.fdcId)) {
      deduped.set(item.fdcId, item);
    }
  });

  return Array.from(deduped.values())
    .map((item) => ({ item, score: scoreVoiceFoodMatch(item, queries) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((entry) => entry.item);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodySize = 0;

    request.on("data", (chunk) => {
      bodySize += chunk.length;
      if (bodySize > maxRequestBodyBytes) {
        reject(new Error(`Request body exceeds the ${formatMb(maxRequestBodyBytes)} limit.`));
        request.destroy();
        return;
      }
      body += chunk;
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

async function buildMealLogFromInput({ body, existingLog }) {
  const mealType = body.mealType || existingLog?.mealType;
  const quantity = Number(body.quantity ?? body.servingGrams ?? existingLog?.quantity);
  const portionUnit = String(body.portionUnit || existingLog?.quantityUnit || "").trim();
  const fdcId = body.fdcId || existingLog?.food?.fdcId;
  const consumedAt = body.consumedAt || existingLog?.consumedAt || new Date().toISOString();

  if (!mealType || !fdcId || !quantity || quantity <= 0) {
    return { error: "mealType, fdcId, and quantity are required." };
  }

  const foodDetail = await loadFoodAnySource(fdcId);
  if (!foodDetail) {
    return { error: "Food not found.", status: 404 };
  }

  const supportedMacroCount = Object.values(foodDetail.nutrientsPer100g).filter(
    (value) => typeof value === "number"
  ).length;
  if (supportedMacroCount === 0) {
    return { error: "This item does not expose usable macro data.", status: 422 };
  }

  const normalizedQuantity = normalizeQuantityForFood(foodDetail, quantity, portionUnit);
  return {
    log: {
      id: existingLog?.id || randomUUID(),
      date: dateKeyFromIso(consumedAt),
      consumedAt,
      mealType,
      quantity,
      quantityUnit: normalizedQuantity.portionUnit,
      effectiveQuantity: normalizedQuantity.effectiveQuantity,
      food: {
        fdcId: foodDetail.fdcId,
        description: foodDetail.description,
        dataType: foodDetail.dataType,
        source: foodDetail.source,
        basis: foodDetail.basis,
        metadata: foodDetail.metadata || {}
      },
      nutrients: computeLoggedNutrients(foodDetail, normalizedQuantity.effectiveQuantity)
    }
  };
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendNotFound(response);
    return;
  }

  if (request.method === "OPTIONS") {
    if (!isRequestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin is not allowed." });
      return;
    }
    sendOptions(response);
    return;
  }

  const url = new URL(request.url, `http://127.0.0.1:${port}`);

  try {
    if (!isRequestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin is not allowed." });
      return;
    }

    if (await handleWearableRoutes(request, response)) {
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/register") {
      if (!enforceRouteRateLimit(request, response, "auth-register", 10, 15 * 60 * 1000)) {
        return;
      }
      const body = await parseBody(request);
      const session = await registerUser(usersPath, sessionsPath, body);
      sendJson(response, 201, session);
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/login") {
      if (!enforceRouteRateLimit(request, response, "auth-login", 12, 15 * 60 * 1000)) {
        return;
      }
      const body = await parseBody(request);
      const session = await loginUser(usersPath, sessionsPath, body);
      sendJson(response, 200, session);
      return;
    }

    if (request.method === "GET" && url.pathname === "/auth/session") {
      const user = await getAuthenticatedUser(usersPath, sessionsPath, request);
      sendJson(response, 200, { user });
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/logout") {
      await logoutSession(sessionsPath, request);
      sendJson(response, 200, { ok: true });
      return;
    }

    const authUser = await getAuthenticatedUser(usersPath, sessionsPath, request);

    if (authUser && (await handleWorkoutRoutes({ request, response, url, authUser, sendJson }))) {
      return;
    }

    if (request.method === "GET" && url.pathname === "/profile") {
      const profile = await getCurrentUserProfile(authUser);
      sendJson(response, 200, profile);
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/profile") {
      const body = await parseBody(request);
      const currentProfile = await getCurrentUserProfile(authUser);
      const override = await updateProfile(profileOverridesPath, authUser, body, currentProfile);

      if (override.name && override.name !== authUser.name) {
        await updateUserProfile(usersPath, authUser.id, { name: override.name });
      }

      const profile = await getCurrentUserProfile({
        ...authUser,
        name: override.name || authUser.name
      });
      sendJson(response, 200, profile);
      return;
    }

    if (request.method === "GET" && url.pathname === "/dashboard") {
      const profile = await getCurrentUserProfile(authUser);
      const date = url.searchParams.get("date") || dateKeyFromIso(new Date());
      const allLogs = await loadMealLogsForUserRuntime(authUser.id);
      const dailyLogs = allLogs.filter((log) => log.date === date);
      const allHydrationLogs = await loadHydrationLogsRuntime(authUser.id);
      const dailyHydrationLogs = allHydrationLogs.filter((log) => log.date === date);
      const waterIntakeMl = dailyHydrationLogs.reduce((sum, log) => sum + Number(log.amountMl || 0), 0);
      const waterTargetMl = calculateWaterTargetMl(profile);
      const summary = summarizeLogs(dailyLogs);
      const weeklySummary = buildWeeklySummary(allLogs, profile);
      const favorites = await loadFavoritesRuntime(authUser.id);
      const recentFoods = buildRecentFoods(allLogs, favorites);
      const nutritionBrain = buildNutritionBrain({
        profile,
        summary,
        weeklySummary,
        waterTargetMl,
        waterIntakeMl,
        dailyLogs,
        allLogs
      });

      sendJson(response, 200, {
        date,
        profile,
        summary: {
          calories: round(summary.calories),
          protein: round(summary.protein),
          carbs: round(summary.carbs),
          fat: round(summary.fat),
          mealCount: summary.mealCount,
          remainingCalories: round(profile.dailyCalorieTarget - summary.calories),
          hasIncompleteData: summary.hasIncompleteData,
          waterIntakeMl,
          waterTargetMl,
          remainingWaterMl: Math.max(0, waterTargetMl - waterIntakeMl)
        },
        logs: dailyLogs.sort((left, right) => right.consumedAt.localeCompare(left.consumedAt)),
        hydrationLogs: dailyHydrationLogs.sort((left, right) => right.loggedAt.localeCompare(left.loggedAt)),
        mealBreakdown: buildMealBreakdown(dailyLogs),
        recentFoods,
        favoriteFoods: buildFavoriteFoods(favorites, recentFoods),
        weeklySummary,
        nutritionBrain
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/hydration-logs") {
      const body = await parseBody(request);
      const amountMl = Number(body.amountMl);

      if (!Number.isFinite(amountMl) || amountMl <= 0) {
        sendJson(response, 400, { error: "Enter a valid water amount in ml." });
        return;
      }

      const loggedAt = body.loggedAt || new Date().toISOString();
      const created = {
        id: randomUUID(),
        userId: authUser.id,
        date: dateKeyFromIso(loggedAt),
        amountMl: Math.round(amountMl),
        loggedAt
      };
      await upsertHydrationLogRuntime(created);
      sendJson(response, 201, created);
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/hydration-logs/")) {
      const logId = decodeURIComponent(url.pathname.split("/").pop() || "");
      const removed = await deleteHydrationLogRuntime(logId, authUser.id);
      if (!removed) {
        sendJson(response, 404, { error: "Hydration log not found." });
        return;
      }
      sendJson(response, 200, { deleted: true, log: removed });
      return;
    }

    if (request.method === "GET" && url.pathname === "/insights/weekly") {
      const profile = await getCurrentUserProfile(authUser);
      const allLogs = await loadMealLogsForUserRuntime(authUser.id);
      sendJson(response, 200, buildWeeklySummary(allLogs, profile));
      return;
    }

    if (request.method === "GET" && url.pathname === "/meal-plans") {
      const days = Number(url.searchParams.get("days") || 14);
      const plans = await loadMealPlansForUser(
        authUser.id,
        Number.isFinite(days) && days > 0 ? days : 14
      );
      sendJson(response, 200, plans);
      return;
    }

    if (request.method === "POST" && url.pathname === "/meal-plans/generate") {
      const body = await parseBody(request);
      const planDate = body.planDate || dateKeyFromIso(new Date());
      const generatedPlan = await generateSavedMealPlan({
        authUser,
        planDate,
        userPrompt: body.userPrompt || "Generate a balanced meal plan."
      });

      const existingPlan = await getMealPlanForUserDate(authUser.id, planDate);
      if (existingPlan) {
        generatedPlan.id = existingPlan.id;
        generatedPlan.createdAt = existingPlan.createdAt;
      }
      await upsertMealPlan(generatedPlan);

      sendJson(response, 201, generatedPlan);
      return;
    }

    if (request.method === "POST" && url.pathname === "/meal-plans/generate-from-readings") {
      const body = await parseBody(request);
      const planDate = body.planDate || dateKeyFromIso(new Date());
      const readings = body.readings || {};
      const hasAnyReading = Object.values(readings).some(
        (value) => value !== null && value !== undefined && String(value).trim() !== ""
      );

      if (!hasAnyReading) {
        sendJson(response, 400, { error: "Add at least one reading before generating a plan." });
        return;
      }

      const syntheticRecord = buildManualReadingsRecord(readings);
      const generatedPlan = await generateSavedMealPlanWithMedicalRecords({
        authUser,
        planDate,
        userPrompt: body.userPrompt || "Generate a balanced meal plan from my manual clinical readings.",
        medicalRecords: [syntheticRecord]
      });

      const existingPlan = await getMealPlanForUserDate(authUser.id, planDate);
      if (existingPlan) {
        generatedPlan.id = existingPlan.id;
        generatedPlan.createdAt = existingPlan.createdAt;
      }
      await upsertMealPlan(generatedPlan);

      sendJson(response, 201, generatedPlan);
      return;
    }

    if (request.method === "POST" && url.pathname === "/restaurants/nearby-recommendations") {
      const body = await parseBody(request);
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const radiusMeters = Math.max(500, Math.min(Number(body.radiusMeters) || 2500, 5000));
      const planDate = body.planDate || dateKeyFromIso(new Date());
      const mealType = body.mealType || inferCurrentMealType();

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        sendJson(response, 400, { error: "Latitude and longitude are required." });
        return;
      }

      const context = await buildNearbyMealContext({
        authUser,
        planDate,
        mealType
      });
      const restaurants = await fetchNearbyRestaurants({
        latitude,
        longitude,
        radiusMeters
      });
      const ranked = rankNearbyRestaurants({
        restaurants,
        meal: context.meal,
        plan: context.plan
      });

      sendJson(response, 200, {
        provider: "openstreetmap_overpass",
        mealType,
        mealTitle: context.meal.title,
        summary: `Nearby options ranked for ${mealType} using your current meal plan, medical records, and active nutrition priorities.`,
        searchRadiusMeters: radiusMeters,
        restaurants: ranked
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/foods/search") {
      const query = url.searchParams.get("q") || "";
      sendJson(response, 200, await searchAllFoods(query, authUser.id));
      return;
    }

    if (request.method === "GET" && url.pathname === "/foods/recents") {
      const logs = await loadMealLogsForUserRuntime(authUser.id);
      const favorites = await loadFavoritesRuntime(authUser.id);
      sendJson(response, 200, buildRecentFoods(logs, favorites));
      return;
    }

    if (request.method === "GET" && url.pathname === "/foods/favorites") {
      const logs = await loadMealLogsForUserRuntime(authUser.id);
      const favorites = await loadFavoritesRuntime(authUser.id);
      sendJson(response, 200, buildFavoriteFoods(favorites, buildRecentFoods(logs, favorites)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/foods/favorites") {
      const body = await parseBody(request);
      const foodDetail = await loadFoodAnySource(body.fdcId);

      if (!foodDetail) {
        sendJson(response, 404, { error: "Food not found." });
        return;
      }

      const favorites = await loadFavoritesRuntime(authUser.id);
      const existing = favorites.find((item) => item.userId === authUser.id && item.foodId === body.fdcId);

      if (existing) {
        await deleteFavoriteRuntime(authUser.id, body.fdcId);
        sendJson(response, 200, { favorite: false });
        return;
      }

      const favorite = {
        id: randomUUID(),
        userId: authUser.id,
        foodId: body.fdcId,
        fdcId: foodDetail.fdcId,
        description: foodDetail.description,
        source: foodDetail.source,
        dataType: foodDetail.dataType,
        basis: foodDetail.basis,
        quantityUnit: foodDetail.quantityUnit,
        metadata: foodDetail.metadata || {},
        addedAt: new Date().toISOString()
      };
      await upsertFavoriteRuntime(favorite);

      sendJson(response, 201, { favorite: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/foods/barcode") {
      const barcode = url.searchParams.get("barcode") || "";
      const barcodeCandidates = buildBarcodeCandidates(barcode);
      if (barcodeCandidates.length === 0) {
        sendJson(response, 400, { error: "Enter a valid barcode." });
        return;
      }
      const match = (await loadCustomFoodsRuntime(authUser.id)).find(
        (item) => item.userId === authUser.id && item.barcode && barcodeCandidates.includes(String(item.barcode).replace(/\D+/g, ""))
      );

      if (match) {
        sendJson(response, 200, {
          fdcId: `custom-${match.id}`,
          description: match.description,
          dataType: "custom_food",
          source: "custom",
          basis: match.basis,
          quantityUnit: match.quantityUnit,
          metadata: match.metadata || {}
        });
        return;
      }

      const providerResult = await lookupBarcodeProduct(barcode);
      if (!providerResult) {
        sendJson(response, 404, { error: "No food found for that barcode." });
        return;
      }

      const created = createCustomFoodRecord({
        userId: authUser.id,
        input: {
          description: providerResult.description,
          brand: providerResult.brand,
          barcode: providerResult.barcode,
          calories: providerResult.calories,
          protein: providerResult.protein,
          carbs: providerResult.carbs,
          fat: providerResult.fat,
          gramsPerServing: providerResult.gramsPerServing
        }
      });
      created.source = "barcode_openfoodfacts";
      created.dataType = "barcode_product";
      created.metadata = {
        ...created.metadata,
        ...providerResult.metadata
      };
      await upsertCustomFoodRuntime(created);

      sendJson(response, 200, {
        fdcId: `custom-${created.id}`,
        description: created.description,
        dataType: created.dataType,
        source: created.source,
        basis: created.basis,
        quantityUnit: created.quantityUnit,
        metadata: created.metadata || {}
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/foods/")) {
      const fdcId = url.pathname.split("/")[2];
      const detail = await loadFoodAnySource(fdcId);

      if (!detail) {
        sendJson(response, 404, { error: "Food not found" });
        return;
      }

      sendJson(response, 200, detail);
      return;
    }

    if (request.method === "POST" && url.pathname === "/custom-foods") {
      const body = await parseBody(request);

      if (!body.description || [body.calories, body.protein, body.carbs, body.fat].some((value) => value === undefined)) {
        sendJson(response, 400, { error: "description, calories, protein, carbs, and fat are required." });
        return;
      }

      const record = createCustomFoodRecord({
        userId: authUser.id,
        input: body
      });

      await upsertCustomFoodRuntime(record);

      sendJson(response, 201, {
        fdcId: `custom-${record.id}`,
        description: record.description,
        dataType: record.dataType,
        source: record.source,
        basis: record.basis,
        quantityUnit: record.quantityUnit,
        metadata: record.metadata,
        nutrientsPer100g: record.nutrientsPer100g
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/admin/custom-foods/review") {
      requireAdminUser(authUser);
      const foods = await loadCustomFoodsRuntime();
      const pending = foods
        .filter((food) => food.promotionStatus === "review")
        .sort((left, right) => {
          if ((right.usageCount || 0) !== (left.usageCount || 0)) {
            return (right.usageCount || 0) - (left.usageCount || 0);
          }
          return String(right.lastUsedAt || "").localeCompare(String(left.lastUsedAt || ""));
        });

      sendJson(response, 200, {
        threshold: customFoodReviewUsageThreshold,
        pendingCount: pending.length,
        foods: pending
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/admin/catalog/audit") {
      requireAdminUser(authUser);
      const search = url.searchParams.get("search") || "";
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 25)));
      const onlyNeedingBackfill = url.searchParams.get("onlyNeedingBackfill") === "true";
      sendJson(
        response,
        200,
        listCuratedCatalogAudit({
          search,
          offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
          limit,
          onlyNeedingBackfill
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/admin/planner-candidates") {
      requireAdminUser(authUser);
      sendJson(response, 200, listPlannerCandidatesForReview(plannerCandidatesPath));
      return;
    }

    if (request.method === "POST" && /^\/admin\/planner-candidates\/[^/]+\/promote$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const candidateId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const body = await parseBody(request);
      const promoted = promotePlannerCandidate({
        candidatesPath: plannerCandidatesPath,
        reviewedMealsPath: reviewedPlannerMealsPath,
        candidateId,
        reviewedBy: authUser.email || authUser.id,
        reviewNotes: String(body.reviewNotes || "")
      });

      if (!promoted) {
        sendJson(response, 404, { error: "Planner candidate not found." });
        return;
      }

      sendJson(response, 200, promoted);
      return;
    }

    if (request.method === "POST" && /^\/admin\/planner-candidates\/[^/]+\/reject$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const candidateId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const body = await parseBody(request);
      const rejected = rejectPlannerCandidate({
        candidatesPath: plannerCandidatesPath,
        candidateId,
        reviewedBy: authUser.email || authUser.id,
        reviewNotes: String(body.reviewNotes || "")
      });

      if (!rejected) {
        sendJson(response, 404, { error: "Planner candidate not found." });
        return;
      }

      sendJson(response, 200, rejected);
      return;
    }

    if (request.method === "PATCH" && /^\/admin\/catalog\/[^/]+$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const catalogId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const body = await parseBody(request);
      const updated = updateCuratedCatalogEntry(
        catalogId,
        {
          metadata: {
            review: {
              sourceNote: typeof body.sourceNote === "string" ? body.sourceNote : undefined,
              sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : undefined,
              workflowStatus: typeof body.workflowStatus === "string" ? body.workflowStatus : undefined
            },
            recipeComposition: body.recipeComposition && typeof body.recipeComposition === "object" ? body.recipeComposition : undefined
          },
          changeSummary: body.changeSummary,
          approve: body.approve === true
        },
        authUser.id
      );

      if (!updated) {
        sendJson(response, 404, { error: "Catalog food not found." });
        return;
      }

      sendJson(response, 200, updated);
      return;
    }

    if (request.method === "GET" && /^\/admin\/catalog\/[^/]+\/composition-preview$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const catalogId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const curatedFood = loadCuratedFoodDetail(catalogId);
      if (!curatedFood) {
        sendJson(response, 404, { error: "Catalog food not found." });
        return;
      }

      const preview = await composeReviewedCatalogFood(curatedFood, async (foodRef) => {
        const refId = String(foodRef?.fdcId || foodRef?.id || "").trim();
        if (!refId || refId === curatedFood.id) {
          return null;
        }
        if (isCuratedFoodId(refId)) {
          return loadCuratedFoodDetail(refId);
        }
        if (isReviewedCustomFoodId(refId)) {
          const reviewedCustomFood = (await loadCustomFoodsRuntime()).find((item) => `reviewed-custom-${item.id}` === refId);
          return reviewedCustomFood
            ? buildCustomFoodDetailFromSearchResult(
                buildReviewedCustomCatalogSearchResult(reviewedCustomFood),
                reviewedCustomFood.nutrientsPer100g
              )
            : null;
        }
        if (isCustomFoodId(refId)) {
          const customFood = (await loadCustomFoodsRuntime()).find((item) => `custom-${item.id}` === refId);
          return customFood
            ? buildCustomFoodDetailFromSearchResult(buildPrivateCustomFoodSearchResult(customFood), customFood.nutrientsPer100g)
            : null;
        }
        if (isIndianFoodId(refId)) {
          return loadIndianFoodDetail(indianNutritionZipPath, indianMealsZipPath, refId);
        }
        return loadFoodDetail(foodCsvPath, foodNutrientCsvPath, refId);
      });

      sendJson(response, 200, {
        catalogId,
        baseFood: curatedFood,
        composedFood: preview.food,
        composition: preview.composition
      });
      return;
    }

    if (request.method === "GET" && /^\/admin\/custom-foods\/[^/]+\/matches$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const foodId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const food = (await loadCustomFoodsRuntime()).find((item) => item.id === foodId);
      if (!food) {
        sendJson(response, 404, { error: "Custom food not found." });
        return;
      }
      sendJson(response, 200, await buildCustomFoodReviewMatches(food));
      return;
    }

    if (request.method === "POST" && /^\/admin\/custom-foods\/[^/]+\/approve$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const foodId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const body = await parseBody(request);
      const updated = await updateCustomFoodRuntime(foodId, (food) => ({
        ...food,
        promotionStatus: "approved",
        reviewNotes: String(body.reviewNotes || "").trim(),
        catalogStatus: "approved",
        catalogPromotedAt: new Date().toISOString(),
        catalogPromotedBy: authUser.id,
        mappedSourceId: food.mappedSourceId || null,
        reviewedAt: new Date().toISOString(),
        reviewedBy: authUser.id
      }));

      if (!updated) {
        sendJson(response, 404, { error: "Custom food not found." });
        return;
      }

      sendJson(response, 200, updated);
      return;
    }

    if (request.method === "POST" && /^\/admin\/custom-foods\/[^/]+\/reject$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const foodId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const body = await parseBody(request);
      const updated = await updateCustomFoodRuntime(foodId, (food) => ({
        ...food,
        promotionStatus: "rejected",
        reviewNotes: String(body.reviewNotes || "").trim(),
        catalogStatus: "rejected",
        reviewedAt: new Date().toISOString(),
        reviewedBy: authUser.id
      }));

      if (!updated) {
        sendJson(response, 404, { error: "Custom food not found." });
        return;
      }

      sendJson(response, 200, updated);
      return;
    }

    if (request.method === "POST" && /^\/admin\/custom-foods\/[^/]+\/merge$/.test(url.pathname)) {
      requireAdminUser(authUser);
      const foodId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const body = await parseBody(request);
      const targetFoodId = String(body.targetFoodId || "").trim();
      const reviewNotes = String(body.reviewNotes || "").trim();

      if (!targetFoodId) {
        sendJson(response, 400, { error: "targetFoodId is required." });
        return;
      }

      const sourceFood = (await loadCustomFoodsRuntime()).find((item) => item.id === foodId);
      if (!sourceFood) {
        sendJson(response, 404, { error: "Custom food not found." });
        return;
      }

      if (targetFoodId.startsWith("custom-")) {
        const targetId = targetFoodId.replace(/^custom-/, "");
        const targetFood = (await loadCustomFoodsRuntime()).find((item) => item.id === targetId);
        if (!targetFood) {
          sendJson(response, 404, { error: "Merge target not found." });
          return;
        }

        const mergedTarget = await updateCustomFoodRuntime(targetId, (food) => ({
          ...food,
          usageCount: Number(food.usageCount || 0) + Number(sourceFood.usageCount || 0),
          lastUsedAt:
            String(food.lastUsedAt || "") > String(sourceFood.lastUsedAt || "")
              ? food.lastUsedAt
              : sourceFood.lastUsedAt,
          reviewNotes: [food.reviewNotes, `Merged duplicate from ${sourceFood.description}`].filter(Boolean).join(" | ")
        }));

        const archivedSource = await updateCustomFoodRuntime(foodId, (food) => ({
          ...food,
          promotionStatus: "rejected",
          catalogStatus: "rejected",
          reviewNotes: reviewNotes || `Merged into ${targetFoodId}`,
          reviewedAt: new Date().toISOString(),
          reviewedBy: authUser.id
        }));

        sendJson(response, 200, { merged: true, target: mergedTarget, source: archivedSource });
        return;
      }

      const archivedSource = await updateCustomFoodRuntime(foodId, (food) => ({
        ...food,
        promotionStatus: "approved",
        catalogStatus: "mapped",
        catalogPromotedAt: new Date().toISOString(),
        catalogPromotedBy: authUser.id,
        mappedSourceId: targetFoodId,
        reviewNotes: reviewNotes || `Mapped to verified source ${targetFoodId}`,
        reviewedAt: new Date().toISOString(),
        reviewedBy: authUser.id
      }));

      sendJson(response, 200, { merged: true, targetFoodId, source: archivedSource });
      return;
    }

    if (request.method === "GET" && url.pathname === "/meal-logs") {
      const date = url.searchParams.get("date") || dateKeyFromIso(new Date());
      const logs = await loadMealLogsForDateRuntime(authUser.id, date);
      sendJson(response, 200, logs);
      return;
    }

    if (request.method === "POST" && url.pathname === "/meal-logs") {
      const body = await parseBody(request);
      const built = await buildMealLogFromInput({ body });
      if (built.error) {
        sendJson(response, built.status || 400, { error: built.error });
        return;
      }
      const { log } = built;
      log.userId = authUser.id;

      await upsertMealLogRuntime(log);
      if (isCustomFoodId(log.food?.fdcId)) {
        await incrementCustomFoodUsage(String(log.food.fdcId).replace(/^custom-/, ""), log.consumedAt);
      }

      sendJson(response, 201, log);
      return;
    }

    if (request.method === "POST" && url.pathname === "/meal-logs/voice") {
      if (!enforceRouteRateLimit(request, response, "voice-log", 20, 10 * 60 * 1000, authUser.id)) {
        return;
      }
      const body = await parseBody(request);
      const filename = body.filename || "voice-log.m4a";
      const mimeType = body.mimeType || "audio/mp4";
      const contentBase64 = body.contentBase64;

      if (!contentBase64) {
        sendJson(response, 400, { error: "contentBase64 is required." });
        return;
      }

      assertMimeAllowed(mimeType, ["audio/*"], "Voice upload");
      const buffer = decodeBase64Payload(contentBase64, maxVoiceUploadBytes, "Voice upload");
      const transcription = await transcribeVoiceMeal({
        filename,
        mimeType,
        buffer
      });
      const parsedItems = parseMultipleMealItems(transcription.transcript);
      const items = [];

      for (const parsedItem of parsedItems) {
        const matches = await searchVoiceFoodMatches(parsedItem, authUser.id);
        const topMatch = matches[0];
        const exactMatch = topMatch && String(topMatch.description || "").toLowerCase() === String(parsedItem.parsed.foodQuery || "").toLowerCase();
        const clarification = buildVoiceClarification(parsedItem, matches);
        items.push({
          ...parsedItem,
          matched: matches.length > 0,
          confidence: exactMatch ? Math.max(parsedItem.confidence || 0.82, 0.92) : parsedItem.confidence || 0.82,
          needsReview: matches.length === 0 || (parsedItem.confidence || 0.82) < 0.85,
          clarification,
          matches: matches.slice(0, 8)
        });
      }

      const primaryItem = items[0] || {
        transcript: transcription.transcript,
        parsed: parseMealTranscriptLocally(transcription.transcript).parsed,
        matches: []
      };

      sendJson(response, 200, {
        transcript: transcription.transcript,
        provider: transcription.provider,
        parsed: primaryItem.parsed,
        matches: primaryItem.matches,
        needsReview: items.some((item) => item.needsReview),
        followUpQuestion: items.find((item) => item.needsReview)?.clarification || null,
        clarifications: items.map((item) => item.clarification).filter(Boolean),
        items
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/meal-logs/voice/parse-text") {
      const body = await parseBody(request);
      const transcript = String(body.transcript || "").trim();
      if (!transcript) {
        sendJson(response, 400, { error: "transcript is required." });
        return;
      }

      const parsedItems = parseMultipleMealItems(transcript);
      const items = [];

      for (const parsedItem of parsedItems) {
        const matches = await searchVoiceFoodMatches(parsedItem, authUser.id);
        const topMatch = matches[0];
        const exactMatch = topMatch && String(topMatch.description || "").toLowerCase() === String(parsedItem.parsed.foodQuery || "").toLowerCase();
        const clarification = buildVoiceClarification(parsedItem, matches);
        items.push({
          ...parsedItem,
          matched: matches.length > 0,
          confidence: exactMatch ? Math.max(parsedItem.confidence || 0.82, 0.92) : parsedItem.confidence || 0.82,
          needsReview: matches.length === 0 || (parsedItem.confidence || 0.82) < 0.85,
          clarification,
          matches
        });
      }

      const primaryItem = items[0] || {
        transcript,
        parsed: parseMealTranscriptLocally(transcript).parsed,
        matches: []
      };

      sendJson(response, 200, {
        transcript,
        provider: "local_text",
        parsed: primaryItem.parsed,
        matches: primaryItem.matches,
        needsReview: items.some((item) => item.needsReview),
        followUpQuestion: items.find((item) => item.needsReview)?.clarification || null,
        clarifications: items.map((item) => item.clarification).filter(Boolean),
        items
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/meal-scans/analyze") {
      if (!enforceRouteRateLimit(request, response, "meal-scan", 20, 10 * 60 * 1000, authUser.id)) {
        return;
      }
      const body = await parseBody(request);
      const filename = String(body.filename || "meal-scan.jpg");
      const mimeType = String(body.mimeType || "image/jpeg");
      const contentBase64 = String(body.contentBase64 || "");
      if (!contentBase64) {
        sendJson(response, 400, { error: "Meal image is required." });
        return;
      }

      try {
        assertMimeAllowed(mimeType, ["image/*"], "Meal image");
        const buffer = decodeBase64Payload(contentBase64, maxMealScanBytes, "Meal image");
        const estimate = await analyzeMealImage({ filename, mimeType, buffer });
        sendJson(response, 200, {
          ...estimate,
          estimated: true,
          source: "openai_vision"
        });
      } catch (error) {
        sendJson(response, 500, {
          error:
            error.message === "OPENAI_API_KEY is required for medical record parsing and meal recommendations."
              ? "Plate scan needs OPENAI_API_KEY right now. Add the key to enable image-based nutrient estimates."
              : error.message
        });
      }
      return;
    }

    if (url.pathname.startsWith("/meal-logs/")) {
      const logId = url.pathname.split("/")[2];
      const logs = await loadMealLogsForUserRuntime(authUser.id);
      const logIndex = logs.findIndex((item) => item.id === logId);

      if (logIndex < 0) {
        sendJson(response, 404, { error: "Meal log not found." });
        return;
      }

      if (request.method === "PATCH") {
        const body = await parseBody(request);
        const built = await buildMealLogFromInput({ body, existingLog: logs[logIndex] });
        if (built.error) {
          sendJson(response, built.status || 400, { error: built.error });
          return;
        }

        await upsertMealLogRuntime(built.log);
        if (isCustomFoodId(built.log.food?.fdcId)) {
          await incrementCustomFoodUsage(String(built.log.food.fdcId).replace(/^custom-/, ""), built.log.consumedAt);
        }
        sendJson(response, 200, built.log);
        return;
      }

      if (request.method === "DELETE") {
        const removed = await deleteMealLogRuntime(logId, authUser.id);
        sendJson(response, 200, { deleted: true, log: removed });
        return;
      }
    }

    if (request.method === "GET" && url.pathname === "/medical-records") {
      const userId = url.searchParams.get("userId") || authUser.id;
      const records = (await listMedicalRecordsForUserFast(medicalRecordsPath, userId)).map((record) => ({
        ...record,
        sourceText: undefined,
        status: record.status || getMedicalRecordStatus(record.extracted)
      }));
      sendJson(response, 200, records);
      return;
    }

    if (request.method === "POST" && url.pathname === "/medical-records/import") {
      if (!enforceRouteRateLimit(request, response, "medical-import", 8, 60 * 60 * 1000, authUser.id)) {
        return;
      }
      const body = await parseBody(request);
      const userId = body.userId || authUser.id;
      const filename = body.filename;
      const mimeType = body.mimeType || "application/octet-stream";
      const contentBase64 = body.contentBase64;

      if (!filename || !contentBase64) {
        sendJson(response, 400, { error: "filename and contentBase64 are required." });
        return;
      }

      assertMimeAllowed(mimeType, ["application/pdf", "image/*", "text/plain"], "Medical record");
      const buffer = decodeBase64Payload(contentBase64, maxMedicalUploadBytes, "Medical record");
      const documentHash = computeDocumentHash(buffer);
      const uploadResult = await persistUpload({ uploadDir: uploadsDir, filename, buffer, mimeType });
      const storedPath = uploadResult.localPath;
      const cachedExtracted = await getCachedMedicalParse(medicalParserCachePath, documentHash);
      let extracted;
      let sourceText = null;
      let sourceTextOrigin = null;

      if (cachedExtracted) {
        extracted = cachedExtracted;
      } else {
        const extractedText = extractTextContentDetailed({ mimeType, buffer, filePath: storedPath });
        const textContent = extractedText.text;
        sourceText = textContent || null;
        sourceTextOrigin = extractedText.source || null;
        extracted = await parseMedicalRecordWithFallback({
          filename,
          mimeType,
          buffer,
          textContent,
          filePath: storedPath
        });
        extracted.medicationContexts = await enrichMedicationList(extracted.medications || []);
        await setCachedMedicalParse(medicalParserCachePath, {
          hash: documentHash,
          filename,
          mimeType,
          parsed: extracted
        });
      }

      if (!Array.isArray(extracted.medicationContexts) || extracted.medicationContexts.length === 0) {
        extracted.medicationContexts = await enrichMedicationList(extracted.medications || []);
      }

      if (!sourceText) {
        const extractedText = extractTextContentDetailed({ mimeType, buffer, filePath: storedPath });
        sourceText = extractedText.text || null;
        sourceTextOrigin = extractedText.source || null;
      }

      const record = await createMedicalRecord(medicalRecordsPath, {
        id: randomUUID(),
        userId,
        filename,
        mimeType,
        uploadedAt: new Date().toISOString(),
        storedPath,
        objectKey: uploadResult.objectKey,
        objectUrl: uploadResult.objectUrl,
        sourceText,
        sourceTextOrigin,
        status: getMedicalRecordStatus(extracted),
        extracted
      });

        await clearMealPlansForUser(userId);

      sendJson(response, 201, record);
      return;
    }

    if (url.pathname.startsWith("/medical-records/")) {
      const recordId = decodeURIComponent(url.pathname.split("/")[2] || "");
      if (!recordId) {
        sendJson(response, 404, { error: "Medical record not found." });
        return;
      }

      if (request.method === "GET") {
        const record = await getMedicalRecordById(medicalRecordsPath, recordId, authUser.id);
        if (!record) {
          sendJson(response, 404, { error: "Medical record not found." });
          return;
        }

        sendJson(response, 200, {
          ...record,
          status: record.status || getMedicalRecordStatus(record.extracted)
        });
        return;
      }

      if (request.method === "PATCH") {
        const body = await parseBody(request);
        const updated = await updateMedicalRecord(medicalRecordsPath, recordId, authUser.id, (record) => {
          const extracted = sanitizeMedicalRecord(
            {
              ...record.extracted,
              ...body.extracted
            },
            {
              provider: body.extracted?.provider || "manual_review",
              confidence:
                typeof body.extracted?.confidence === "number"
                  ? body.extracted.confidence
                  : Math.max(record.extracted?.confidence || 0, 0.95),
              fallbackSummary: body.extracted?.summary || record.extracted?.summary || "Reviewed medical record"
            }
          );
          const medicationContexts = body.extracted?.medicationContexts || record.extracted?.medicationContexts || [];
          extracted.medicationContexts = medicationContexts;

          return {
            ...record,
            status: getMedicalRecordStatus(extracted),
            extracted
          };
        });

        if (!updated) {
          sendJson(response, 404, { error: "Medical record not found." });
          return;
        }

        updated.extracted.medicationContexts = await enrichMedicationList(updated.extracted.medications || []);
        const normalizedUpdated = await updateMedicalRecord(medicalRecordsPath, recordId, authUser.id, (record) => ({
          ...record,
          extracted: sanitizeMedicalRecord({
            ...record.extracted,
            medicationContexts: updated.extracted.medicationContexts
          }),
          status: getMedicalRecordStatus({
            ...record.extracted,
            medicationContexts: updated.extracted.medicationContexts
          })
        }));

        await clearMealPlansForUser(authUser.id);

        sendJson(response, 200, normalizedUpdated || updated);
        return;
      }

      if (request.method === "DELETE") {
        const removed = await deleteMedicalRecord(medicalRecordsPath, recordId, authUser.id);
        if (!removed) {
          sendJson(response, 404, { error: "Medical record not found." });
          return;
        }

        await clearMealPlansForUser(authUser.id);

        sendJson(response, 200, { deleted: true, record: removed });
        return;
      }

      if (request.method === "POST" && url.pathname.endsWith("/reparse-text")) {
        const body = await parseBody(request);
        const sourceText = String(body.sourceText || "").trim();

        if (!sourceText) {
          sendJson(response, 400, { error: "sourceText is required." });
          return;
        }

        const extracted = parseMedicalText(sourceText);
        extracted.medicationContexts = await enrichMedicationList(extracted.medications || []);
        const updated = await updateMedicalRecord(medicalRecordsPath, recordId, authUser.id, (record) => ({
          ...record,
          sourceText,
          sourceTextOrigin: "manual_review_text",
          extracted,
          status: getMedicalRecordStatus(extracted)
        }));

        if (!updated) {
          sendJson(response, 404, { error: "Medical record not found." });
          return;
        }

        await clearMealPlansForUser(authUser.id);

        sendJson(response, 200, updated);
        return;
      }
    }

    if (request.method === "POST" && url.pathname === "/recommendations/meals") {
      const profile = await getCurrentUserProfile(authUser);
      const body = await parseBody(request);
      const userId = body.userId || authUser.id;
      const userPrompt = body.userPrompt || "Recommend meals for today";
      const medicalRecords = await listMedicalRecordsForUserFast(medicalRecordsPath, userId);
      const recentLogs = await loadMealLogsForUserRuntime(authUser.id)
        .sort((left, right) => left.consumedAt.localeCompare(right.consumedAt))
        .slice(-20);
      const plan = {
        ...(await createRecommendationPlanWithFallback({
          profile,
          medicalRecords,
          userPrompt,
          recentLogs,
          recentPlanTitles: await getRecentPlannedTitles(authUser.id, null)
        })),
        userId: userId
      };

      const candidateMap = new Map();
      for (const query of plan.searchQueries) {
        const results = await searchAllFoods(query, authUser.id);
        for (const result of results.slice(0, 10)) {
          if (!candidateMap.has(result.fdcId)) {
            const detail = await loadFoodAnySource(result.fdcId);
            if (detail) {
              candidateMap.set(result.fdcId, detail);
            }
          }
        }
      }

      const candidates = Array.from(candidateMap.values()).slice(0, 48);
      const recommendation = await chooseMealsWithFallback({
        profile,
        medicalRecords,
        userPrompt,
        candidates,
        plan
      });

      sendJson(response, 200, {
        plan,
        candidates,
        ...recommendation
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/planner/catalog-meals") {
      const plannerFeedbackIndex = buildPlannerFeedbackIndex(loadPlannerCandidates(plannerCandidatesPath));
      const annotateWithFeedback = (meal) => {
        const feedbackKey = `${normalizePlannerMealText(meal.mealType || "snack")}:${normalizePlannerMealText(meal.title)}`;
        const candidate = plannerFeedbackIndex.get(feedbackKey);
        return {
          ...meal,
          popularityScore: Number(candidate?.qualityScore || 0),
          popularitySignals: candidate
            ? {
                acceptedCount: Number(candidate.acceptedCount || 0),
                passedCount: Number(candidate.passedCount || 0),
                loggedCount: Number(candidate.loggedCount || 0),
                uniqueUserCount: Number(candidate.uniqueUserCount || 0)
              }
            : undefined
        };
      };

      const reviewedPlannerMeals = loadReviewedPlannerMeals(reviewedPlannerMealsPath).map(annotateWithFeedback);
      const curatedPlannerMeals = await Promise.all(
        getCuratedFoods()
          .filter((food) => food?.metadata?.mealType)
          .map(async (food) => {
            const { food: composedFood, composition } = await composeReviewedCatalogFood(food, async (foodRef) => {
              const refId = foodRef?.fdcId || foodRef?.id;
              if (!refId) {
                return null;
              }
              return loadFoodAnySource(refId);
            });

            const plannerFood = composedFood || food;
            const perServing =
              composition?.composedPerServing ||
              (plannerFood.basis === "per_serving" ? plannerFood.nutrientsPer100g : null);
            const recipeComposition = plannerFood.metadata?.recipeComposition || {};
            const servingWeightGrams =
              Number(recipeComposition.servingWeightGrams || composition?.servingWeightGrams || 0) || null;

            return annotateWithFeedback({
              id: plannerFood.id,
              title: plannerFood.description,
              description: plannerFood.description,
              mealType: plannerFood.metadata?.mealType || null,
              calories: Number(perServing?.calories || plannerFood.nutrientsPer100g?.calories || 0),
              protein: Number(perServing?.protein || plannerFood.nutrientsPer100g?.protein || 0),
              carbs: Number(perServing?.carbs || plannerFood.nutrientsPer100g?.carbs || 0),
              fat: Number(perServing?.fat || plannerFood.nutrientsPer100g?.fat || 0),
              servingSuggestion: servingWeightGrams ? `1 serving (${servingWeightGrams} g)` : "1 serving",
              tags: plannerFood.metadata?.tagList || [],
              cuisineTags: plannerFood.metadata?.cuisineTags || [],
              source: plannerFood.source,
              nutritionConfidence:
                composition?.nutritionConfidence || plannerFood.metadata?.recipeComposition?.nutritionConfidence || "medium",
              recipe: {
                ingredients: Array.isArray(recipeComposition.ingredients)
                  ? recipeComposition.ingredients
                      .map((ingredient) => String(ingredient?.label || "").trim())
                      .filter(Boolean)
                  : [],
                instructions: []
              }
            });
          })
      );

      const datasetPlannerMeals = getIndianFoods(indianNutritionZipPath, indianMealsZipPath)
        .filter((food) => food.source === "indian-meals" && food.description)
        .filter(isPlannerReadyIndianDatasetMeal)
        .map((food) => {
          const calories = Number(food.nutrientsPer100g?.calories || 0);
          const protein = Number(food.nutrientsPer100g?.protein || 0);
          const carbs = Number(food.nutrientsPer100g?.carbs || 0);
          const fat = Number(food.nutrientsPer100g?.fat || 0);
          const mealType = inferPlannerMealTypeFromDatasetMeal(food.description, calories);
          const sourceMealType = normalizePlannerMealText(food.metadata?.mealType || "");
          const cuisineTags = [food.metadata?.state].filter(Boolean);
          const tags = Array.from(
            new Set(
              [
                sourceMealType.includes("veg") ? "vegetarian" : null,
                sourceMealType.includes("vegan") ? "vegan" : null,
                sourceMealType.includes("non") ? "non_vegetarian" : null,
                protein >= 18 ? "high_protein" : null,
                carbs >= 55 ? "hearty" : null,
                calories <= 250 ? "light" : null
              ].filter(Boolean)
            )
          );

          return annotateWithFeedback({
            id: food.id,
            title: food.description,
            description: `${food.metadata?.state || "Regional"} ${sourceMealType || "meal"}`.trim(),
            mealType,
            calories,
            protein,
            carbs,
            fat,
            servingSuggestion: "1 serving",
            tags,
            cuisineTags,
            source: food.source,
            nutritionConfidence: "medium",
            recipe: null
          });
        })
        .filter((meal) => meal.calories > 0)
        .sort((left, right) => right.protein - left.protein)
        .slice(0, 320);

      const fnddsPlannerMeals = (await getFnddsMeals(fnddsMainFoodCsvPath, fnddsNutrientCsvPath))
        .filter(isPlannerReadyFnddsMeal)
        .map((food) => {
          const calories = Number(food.nutrientsPer100g?.calories || 0);
          const protein = Number(food.nutrientsPer100g?.protein || 0);
          const carbs = Number(food.nutrientsPer100g?.carbs || 0);
          const fat = Number(food.nutrientsPer100g?.fat || 0);
          const normalizedDescription = normalizePlannerMealText(food.description);
          const mealType = inferPlannerMealTypeFromDatasetMeal(food.description, calories);
          const tags = Array.from(
            new Set(
              [
                protein >= 20 ? "high_protein" : null,
                carbs >= 55 ? "hearty" : null,
                calories <= 250 ? "light" : null,
                normalizedDescription.includes("sandwich") || normalizedDescription.includes("burger") ? "handheld" : null,
                normalizedDescription.includes("salad") ? "fresh" : null,
                normalizedDescription.includes("soup") || normalizedDescription.includes("stew") ? "comfort" : null
              ].filter(Boolean)
            )
          );

          return annotateWithFeedback({
            id: food.id,
            title: food.description,
            description: "USDA FNDDS mixed dish",
            mealType,
            calories,
            protein,
            carbs,
            fat,
            servingSuggestion: "100 g",
            tags,
            cuisineTags: ["usda", "mixed_dish"],
            source: food.source,
            nutritionConfidence: calories > 0 ? "high" : "medium",
            recipe: null
          });
        })
        .filter((meal) => meal.title && meal.calories > 0)
        .sort((left, right) => right.protein - left.protein)
        .slice(0, 260);

      const dedupedPlannerMeals = Array.from(
        [...reviewedPlannerMeals, ...curatedPlannerMeals, ...datasetPlannerMeals, ...fnddsPlannerMeals].reduce((map, meal) => {
          const key = `${meal.mealType}:${normalizePlannerMealText(meal.title)}`;
          if (!map.has(key)) {
            map.set(key, meal);
          }
          return map;
        }, new Map()).values()
      );

      sendJson(response, 200, dedupedPlannerMeals);
      return;
    }

    if (request.method === "POST" && url.pathname === "/planner/feedback") {
      const body = await parseBody(request);
      const title = String(body.title || "").trim();
      const mealType = String(body.mealType || "").trim().toLowerCase();
      const action = String(body.action || "").trim().toLowerCase();

      if (!title || !mealType || !/^(accepted|passed|logged)$/.test(action)) {
        sendJson(response, 400, { error: "title, mealType, and a valid action are required." });
        return;
      }

      const updated = recordPlannerFeedback(plannerCandidatesPath, {
        userId: authUser.id,
        action,
        occurredAt: new Date().toISOString(),
        title,
        description: String(body.description || ""),
        mealType,
        source: String(body.source || "planner"),
        sourceMealId: String(body.sourceMealId || ""),
        calories: Number(body.calories || 0),
        protein: Number(body.protein || 0),
        carbs: Number(body.carbs || 0),
        fat: Number(body.fat || 0),
        servingSuggestion: String(body.servingSuggestion || "1 serving"),
        tags: Array.isArray(body.tags) ? body.tags.map((item) => String(item)) : [],
        cuisineTags: Array.isArray(body.cuisineTags) ? body.cuisineTags.map((item) => String(item)) : [],
        nutritionConfidence: ["high", "medium", "low"].includes(String(body.nutritionConfidence || ""))
          ? String(body.nutritionConfidence)
          : "medium",
        recipe:
          body.recipe && Array.isArray(body.recipe.ingredients)
            ? {
                ingredients: body.recipe.ingredients.map((item) => String(item)),
                instructions: Array.isArray(body.recipe.instructions)
                  ? body.recipe.instructions.map((item) => String(item))
                  : []
              }
            : null
      });

      sendJson(response, 200, {
        ok: true,
        candidateId: updated.id,
        reviewStatus: updated.status,
        qualityScore: updated.qualityScore
      });
      return;
    }

    sendNotFound(response);
  } catch (error) {
    if (error instanceof Error && /Authentication required|Session expired|User account not found/.test(error.message)) {
      sendJson(response, 401, { error: error.message });
      return;
    }
    if (error instanceof Error && error.statusCode === 403) {
      sendJson(response, 403, { error: error.message });
      return;
    }
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

server.listen(port, host, () => {
  console.log(`ApolloStay API running on http://${host}:${port}`);
});
