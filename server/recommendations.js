function normalize(value) {
  return String(value || "").toLowerCase();
}

const { expandFoodSearchQueries, normalizeFoodSearchQuery } = require("./food-aliases");

function collectMedicalContext(profile, medicalRecords) {
  const diagnoses = [];
  const dietaryFlags = [];
  const allergies = [...(profile?.allergies || [])];
  const labs = [];
  const medications = [];
  const medicationContexts = [];

  for (const record of medicalRecords || []) {
    diagnoses.push(...(record?.extracted?.diagnoses || []));
    dietaryFlags.push(...(record?.extracted?.dietaryFlags || []));
    allergies.push(...(record?.extracted?.allergies || []));
    medications.push(...(record?.extracted?.medications || []));
    medicationContexts.push(...(record?.extracted?.medicationContexts || []));
    labs.push(...(record?.extracted?.labResults || []));
  }

  return {
    diagnoses: diagnoses.map(normalize),
    dietaryFlags: dietaryFlags.map(normalize),
    allergies: allergies.map(normalize),
    medications: medications.map(normalize),
    medicationContexts,
    labs
  };
}

function getLabNumericValue(labs, pattern) {
  const match = (labs || []).find((lab) => pattern.test(normalize(lab?.name)));
  const rawValue = match?.value;
  const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildContextBlob(profile, medicalRecords, userPrompt) {
  return normalize(
    JSON.stringify({
      profile,
      medicalRecords,
      userPrompt
    })
  );
}

function detectMealType(prompt) {
  const normalizedPrompt = normalize(prompt);
  if (normalizedPrompt.includes("breakfast")) {
    return "breakfast";
  }
  if (normalizedPrompt.includes("lunch")) {
    return "lunch";
  }
  if (normalizedPrompt.includes("dinner")) {
    return "dinner";
  }
  if (normalizedPrompt.includes("snack")) {
    return "snack";
  }
  return "meal";
}

function extractPromptSignals(prompt) {
  const normalizedPrompt = normalize(prompt);

  return {
    wantsIndian: /\bindian|south indian|north indian|desi\b/.test(normalizedPrompt),
    wantsVegetarian: /\bveg|vegetarian\b/.test(normalizedPrompt),
    wantsVegan: /\bvegan|plant based|plant-based\b/.test(normalizedPrompt),
    wantsNonVegetarian: /\bnon veg|non-veg|non vegetarian|non-vegetarian\b/.test(normalizedPrompt),
    wantsHighProtein: /\bhigh protein|protein rich|more protein\b/.test(normalizedPrompt),
    wantsLowSugar: /\blow sugar|low gi|low glycemic|diabetic|blood sugar\b/.test(normalizedPrompt),
    wantsLowSodium: /\blow sodium|less salt|low salt|hypertension|blood pressure\b/.test(normalizedPrompt),
    wantsIronSupport: /\biron|anemia|haemoglobin|hemoglobin|ferritin\b/.test(normalizedPrompt),
    wantsQuick: /\bquick|fast|easy\b/.test(normalizedPrompt),
    wantsLight: /\blight|simple|gentle\b/.test(normalizedPrompt),
    wantsBreakfastSavory: /\bsavory|savoury\b/.test(normalizedPrompt)
  };
}

function getNormalizedDietaryPreferences(profile) {
  return (profile?.dietaryPreferences || []).map((value) => normalize(value));
}

function resolveDietStyle(profile, promptSignals) {
  const preferences = getNormalizedDietaryPreferences(profile);

  if (promptSignals?.wantsVegan || preferences.some((value) => value.includes("vegan"))) {
    return "vegan";
  }
  if (
    promptSignals?.wantsNonVegetarian ||
    preferences.some(
      (value) =>
        value.includes("non veg") ||
        value.includes("non-veg") ||
        value.includes("non vegetarian") ||
        value.includes("non-vegetarian") ||
        value.includes("eggetarian")
    )
  ) {
    return "non_vegetarian";
  }
  if (
    promptSignals?.wantsVegetarian ||
    preferences.some(
      (value) =>
        value === "veg" ||
        value === "vegetarian" ||
        value.includes("lacto vegetarian") ||
        value.includes("ovo vegetarian")
    )
  ) {
    return "vegetarian";
  }
  return "balanced";
}

function filterQueriesForDiet(queries, dietStyle) {
  if (dietStyle === "vegan") {
    return queries.filter((query) => !/(egg|omelette|paneer|curd|yogurt|greek yogurt|chicken|fish|mutton|prawn|meat)/.test(normalize(query)));
  }
  if (dietStyle === "vegetarian") {
    return queries.filter((query) => !/(chicken|fish|mutton|prawn|meat)/.test(normalize(query)));
  }
  return queries;
}

function getFoodDietType(candidate) {
  const text = normalize(
    [
      candidate?.description,
      candidate?.metadata?.cuisine,
      candidate?.metadata?.tags,
      candidate?.source,
      candidate?.dataType
    ].join(" ")
  );

  if (/(chicken|fish|mutton|prawn|meat|egg|omelette|egg curry)/.test(text)) {
    return "non_vegetarian";
  }
  if (/(paneer|curd|yogurt|greek yogurt|milk|cheese)/.test(text)) {
    return "vegetarian";
  }
  return "vegan";
}

function isCandidateCompatibleWithDiet(candidate, dietStyle) {
  const dietType = getFoodDietType(candidate);
  if (dietStyle === "vegan") {
    return dietType === "vegan";
  }
  if (dietStyle === "vegetarian") {
    return dietType !== "non_vegetarian";
  }
  return true;
}

function getAvoidTerms(profile, medicalRecords) {
  const blob = buildContextBlob(profile, medicalRecords, "");
  const context = collectMedicalContext(profile, medicalRecords);
  const glucoseValue = getLabNumericValue(context.labs, /(blood glucose|glucose|hba1c)/);
  const hemoglobinValue = getLabNumericValue(context.labs, /hemoglobin|hb\b/);
  const avoid = new Set();

  if (blob.includes("diabet") || blob.includes("blood glucose") || blob.includes("hba1c")) {
    avoid.add("sweetened");
    avoid.add("sugar");
    avoid.add("dessert");
  }
  if (blob.includes("hypertension") || blob.includes("blood pressure") || blob.includes("sodium")) {
    avoid.add("pickle");
    avoid.add("salted");
    avoid.add("high sodium");
  }
  if (blob.includes("cholesterol") || blob.includes("triglyceride")) {
    avoid.add("deep fried");
    avoid.add("fried");
    avoid.add("butter");
  }
  if (blob.includes("kidney") || blob.includes("renal") || blob.includes("creatinine")) {
    avoid.add("very high sodium");
    avoid.add("processed");
  }
  if (context.dietaryFlags.some((flag) => flag.includes("lower glycemic"))) {
    avoid.add("sweet");
    avoid.add("sweetened");
    avoid.add("sugary");
  }
  if (context.dietaryFlags.some((flag) => flag.includes("lower sodium"))) {
    avoid.add("pickle");
    avoid.add("instant");
  }
  if (context.dietaryFlags.some((flag) => flag.includes("heart healthy"))) {
    avoid.add("fried");
    avoid.add("ghee");
    avoid.add("butter");
  }
  if (context.medicationContexts.some((item) => (item.tags || []).includes("glucose_sensitive"))) {
    avoid.add("sweetened");
    avoid.add("dessert");
  }
  if (context.medicationContexts.some((item) => (item.tags || []).includes("low_sodium"))) {
    avoid.add("salted");
    avoid.add("instant");
  }
  if (glucoseValue !== null && glucoseValue >= 100) {
    avoid.add("sweetened");
    avoid.add("dessert");
    avoid.add("juice");
  }
  if (hemoglobinValue !== null && hemoglobinValue < 12) {
    avoid.add("empty calories");
  }
  for (const allergy of context.allergies) {
    if (allergy) {
      avoid.add(allergy);
    }
  }

  return Array.from(avoid);
}

function getNutritionPriorities(profile, medicalRecords) {
  const priorities = new Set();
  const blob = buildContextBlob(profile, medicalRecords, "");
  const context = collectMedicalContext(profile, medicalRecords);
  const glucoseValue = getLabNumericValue(context.labs, /(blood glucose|glucose)/);
  const hba1cValue = getLabNumericValue(context.labs, /hba1c/);
  const hemoglobinValue = getLabNumericValue(context.labs, /hemoglobin|hb\b/);

  priorities.add("match_user_goal");
  if ((profile?.dietaryPreferences || []).includes("vegetarian")) {
    priorities.add("vegetarian_friendly");
  }
  if (getNormalizedDietaryPreferences(profile).some((value) => value.includes("vegan"))) {
    priorities.add("vegan_friendly");
  }
  if (blob.includes("diabet") || blob.includes("blood glucose") || blob.includes("hba1c")) {
    priorities.add("lower_glycemic_load");
  }
  if ((glucoseValue !== null && glucoseValue >= 100) || (hba1cValue !== null && hba1cValue >= 5.7)) {
    priorities.add("lower_glycemic_load");
  }
  if (blob.includes("anemia") || blob.includes("ferritin") || blob.includes("hemoglobin") || blob.includes("iron")) {
    priorities.add("iron_supportive");
  }
  if (hemoglobinValue !== null && hemoglobinValue < 12) {
    priorities.add("iron_supportive");
  }
  if (blob.includes("hypertension") || blob.includes("blood pressure")) {
    priorities.add("lower_sodium");
  }
  if (blob.includes("cholesterol") || blob.includes("triglyceride")) {
    priorities.add("heart_healthy_fats");
  }
  if (blob.includes("pcos")) {
    priorities.add("higher_protein_balanced_carbs");
  }
  if (blob.includes("thyroid")) {
    priorities.add("steady_energy");
  }
  if (context.medicationContexts.some((item) => (item.tags || []).includes("glucose_sensitive"))) {
    priorities.add("lower_glycemic_load");
  }
  if (context.medicationContexts.some((item) => (item.tags || []).includes("heart_healthy"))) {
    priorities.add("heart_healthy_fats");
  }
  if (context.medicationContexts.some((item) => (item.tags || []).includes("low_sodium"))) {
    priorities.add("lower_sodium");
  }
  if (context.medicationContexts.some((item) => (item.tags || []).includes("thyroid_support"))) {
    priorities.add("steady_energy");
  }
  for (const flag of context.dietaryFlags) {
    if (flag.includes("lower_glycemic")) {
      priorities.add("lower_glycemic_load");
    }
    if (flag.includes("iron")) {
      priorities.add("iron_supportive");
    }
    if (flag.includes("lower_sodium")) {
      priorities.add("lower_sodium");
    }
    if (flag.includes("heart_healthy")) {
      priorities.add("heart_healthy_fats");
    }
    if (flag.includes("thyroid")) {
      priorities.add("steady_energy");
    }
    if (flag.includes("kidney")) {
      priorities.add("kidney_friendly");
    }
  }

  return Array.from(priorities);
}

function addQueries(set, values) {
  values.forEach((value) => {
    if (value) {
      set.add(value);
    }
  });
}

function addExpandedQueries(set, values) {
  for (const value of values || []) {
    for (const expanded of expandFoodSearchQueries(value)) {
      if (expanded) {
        set.add(expanded);
      }
    }
  }
}

function getMealSpecificQueries(mealType) {
  if (mealType === "breakfast") {
    return [
      "idli",
      "dosa",
      "upma",
      "poha",
      "oats",
      "omelette",
      "egg",
      "paneer breakfast",
      "sprouts breakfast",
      "yogurt breakfast",
      "moong chilla",
      "besan chilla",
      "ragi dosa",
      "vegetable sandwich",
      "millet porridge",
      "avocado toast",
      "peanut chilla",
      "pesarattu",
      "ragi idli",
      "vegetable uthappam",
      "curd bowl",
      "ragi malt"
    ];
  }
  if (mealType === "lunch") {
    return [
      "dal",
      "paneer",
      "rajma",
      "chicken curry",
      "roti",
      "brown rice",
      "curd rice",
      "millet khichdi",
      "sambar rice",
      "fish curry",
      "quinoa bowl",
      "tofu bowl",
      "palak paneer",
      "chole",
      "curd rice",
      "vegetable pulao",
      "sambhar rice",
      "dal khichdi"
    ];
  }
  if (mealType === "dinner") {
    return [
      "khichdi",
      "soup",
      "dal dinner",
      "grilled chicken",
      "paneer dinner",
      "salad",
      "millet dosa",
      "tofu stir fry",
      "vegetable stew",
      "egg curry",
      "palak soup",
      "dal soup",
      "paneer curry",
      "vegetable pulao"
    ];
  }
  if (mealType === "snack") {
    return ["sprouts", "chana", "fruit bowl", "makhana", "chai", "nuts", "yogurt bowl", "hummus", "roasted corn", "chaas", "lassi", "corn chaat", "fruit chaat"];
  }
  return ["paneer", "dal", "yogurt", "sprouts", "egg"];
}

function getPriorityQueries(priorities, mealType) {
  const queries = new Set();

  if (priorities.includes("lower_glycemic_load")) {
    addQueries(queries, mealType === "breakfast"
      ? ["sprouts", "omelette", "oats", "vegetable dosa", "greek yogurt", "moong chilla", "paneer bhurji"]
      : ["dal", "sprouts", "paneer", "grilled chicken", "salad", "millet bowl"]);
  }

  if (priorities.includes("iron_supportive")) {
    addQueries(queries, mealType === "breakfast"
      ? ["egg", "ragi dosa", "sprouts", "paneer bhurji", "chana chaat"]
      : ["chana", "rajma", "paneer", "egg curry", "greens", "palak paneer"]);
  }

  if (priorities.includes("lower_sodium")) {
    addQueries(queries, ["home style", "oats", "fruit", "salad", "fresh", "steamed"]);
  }

  if (priorities.includes("heart_healthy_fats")) {
    addQueries(queries, ["oats", "yogurt", "sprouts", "grilled", "steamed"]);
  }

  if (priorities.includes("higher_protein_balanced_carbs")) {
    addQueries(queries, mealType === "breakfast"
      ? ["omelette", "paneer bhurji", "protein oats", "greek yogurt", "sprouts"]
      : ["paneer", "chicken", "dal", "egg", "curd"]);
  }

  if (priorities.includes("vegetarian_friendly")) {
    addQueries(queries, ["paneer", "idli", "dosa", "poha", "upma", "sprouts", "dal"]);
  }

  if (priorities.includes("kidney_friendly")) {
    addQueries(queries, ["light breakfast", "vegetable upma", "plain oats", "fruit bowl"]);
  }

  return Array.from(queries);
}

function getPromptQueries(signals, mealType) {
  const queries = new Set();

  if (signals.wantsHighProtein) {
    addQueries(queries, mealType === "breakfast"
      ? ["omelette", "paneer bhurji", "sprouts breakfast", "greek yogurt", "moong chilla"]
      : ["paneer", "chicken", "dal", "egg curry", "sprouts"]);
  }

  if (signals.wantsLowSugar) {
    addQueries(queries, mealType === "breakfast"
      ? ["sprouts", "omelette", "oats", "paneer breakfast", "chilla"]
      : ["dal", "salad", "paneer", "grilled chicken", "curd"]);
  }

  if (signals.wantsIronSupport) {
    addQueries(queries, mealType === "breakfast"
      ? ["ragi dosa", "egg", "sprouts", "paneer bhurji", "chana chaat"]
      : ["rajma", "chana", "palak paneer", "greens", "egg curry"]);
  }

  if (signals.wantsLowSodium) {
    addQueries(queries, ["home style", "fresh", "steamed", "plain oats", "fruit bowl"]);
  }

  if (signals.wantsVegetarian) {
    addQueries(queries, ["paneer", "sprouts", "dal", "oats", "ragi dosa", "poha"]);
  }

  if (signals.wantsQuick) {
    addQueries(queries, ["omelette", "oats", "yogurt", "sandwich", "poha"]);
  }

  if (signals.wantsLight) {
    addQueries(queries, ["fruit bowl", "yogurt", "salad", "sprouts", "soup"]);
  }

  if (signals.wantsBreakfastSavory && mealType === "breakfast") {
    addQueries(queries, ["omelette", "sprouts", "paneer bhurji", "moong chilla", "upma"]);
  }

  return Array.from(queries);
}

function getVarietyQueries(mealType, signals) {
  const queries = new Set();

  if (mealType === "breakfast") {
    addQueries(queries, ["uttapam", "vegetable sandwich", "millet idli", "sprouts bowl", "yogurt bowl"]);
  }
  if (mealType === "lunch") {
    addQueries(queries, ["rajma bowl", "dal plate", "paneer bowl", "tofu bowl", "vegetable rice"]);
  }
  if (mealType === "dinner") {
    addQueries(queries, ["lentil soup", "vegetable stew", "paneer stir fry", "khichdi", "salad bowl"]);
  }
  if (mealType === "snack") {
    addQueries(queries, ["makhana", "roasted chana", "corn chaat", "greek yogurt", "fruit bowl"]);
  }

  if (signals.wantsIndian) {
    addQueries(queries, ["south indian", "north indian", "regional meal"]);
  }

  return Array.from(queries);
}

function localRecommendationPlan({ profile, medicalRecords, userPrompt, recentLogs = [], recentPlanTitles = [] }) {
  const normalizedPrompt = normalize(userPrompt);
  const mealType = detectMealType(userPrompt);
  const promptSignals = extractPromptSignals(userPrompt);
  const dietStyle = resolveDietStyle(profile, promptSignals);
  const priorities = getNutritionPriorities(profile, medicalRecords);
  const queries = new Set();
  const recentFoodTitles = recentLogs
    .filter((log) => !mealType || mealType === "meal" || log.mealType === mealType)
    .slice(-8)
    .map((log) => normalize(log.food?.description || ""));
  const normalizedRecentPlanTitles = recentPlanTitles.map((value) => normalize(value)).filter(Boolean);

  addExpandedQueries(queries, filterQueriesForDiet(getMealSpecificQueries(mealType), dietStyle));
  addExpandedQueries(queries, filterQueriesForDiet(getPriorityQueries(priorities, mealType), dietStyle));
  addExpandedQueries(queries, filterQueriesForDiet(getPromptQueries(promptSignals, mealType), dietStyle));
  addExpandedQueries(queries, filterQueriesForDiet(getVarietyQueries(mealType, promptSignals), dietStyle));

  if (promptSignals.wantsIndian) {
    addExpandedQueries(queries, ["indian breakfast", "south indian", "north indian", "regional meal"]);
  }
  if (dietStyle === "vegan") {
    addExpandedQueries(queries, ["tofu", "sprouts", "dal", "oats", "millet bowl", "hummus", "makhana"]);
  }
  if (dietStyle === "vegetarian") {
    addExpandedQueries(queries, ["vegetarian", "veg", "paneer", "dal", "sprouts"]);
  }
  if (dietStyle === "non_vegetarian") {
    addExpandedQueries(queries, ["egg", "omelette", "chicken", "fish curry", "grilled chicken"]);
    if (mealType === "breakfast") {
      ["idli", "dosa", "upma", "poha", "oats"].forEach((query) => queries.delete(query));
    }
  }

  if (priorities.includes("lower_glycemic_load") || promptSignals.wantsLowSugar) {
    ["idli", "dosa", "poha", "upma"].forEach((query) => queries.delete(query));
  }

  if (priorities.includes("iron_supportive") && mealType === "breakfast") {
    queries.delete("idli");
    queries.delete("poha");
  }

  if (queries.size === 0) {
    addExpandedQueries(queries, filterQueriesForDiet(["paneer", "dal", "sprouts", "egg", "yogurt", "tofu"], dietStyle));
  }

  return {
    provider: "local",
    mealType,
    reasoningSummary: "Used rule-based planning from the current profile, prompt, saved health records, and normalized medication context.",
    searchQueries: Array.from(queries).slice(0, 20),
    avoidTerms: getAvoidTerms(profile, medicalRecords),
    nutritionPriorities: priorities,
    recentFoodTitles,
    recentPlanTitles: normalizedRecentPlanTitles,
    promptSignals,
    dietStyle
  };
}

function getCandidateText(candidate) {
  return normalize(
    [
      candidate.description,
      candidate.dataType,
      candidate.source || "",
      candidate.metadata?.mealType || "",
      candidate.metadata?.state || "",
      candidate.metadata?.cuisine || "",
      candidate.metadata?.tags || "",
      expandFoodSearchQueries(candidate.description).join(" ")
    ].join(" ")
  );
}

function scoreCandidate(candidate, plan) {
  const text = getCandidateText(candidate);
  const dietType = getFoodDietType(candidate);
  const calories = candidate.nutrientsPer100g.calories;
  const protein = candidate.nutrientsPer100g.protein;
  const fat = candidate.nutrientsPer100g.fat;
  const carbs = candidate.nutrientsPer100g.carbs;
  const usageCount = Number(candidate?.metadata?.usageCount || 0);
  const isOwnedPrivateCustomFood =
    candidate?.source === "custom" &&
    candidate?.metadata?.customFoodOwnerId &&
    candidate.metadata.customFoodOwnerId === plan.userId;
  let score = 0;

  for (const query of plan.searchQueries) {
    if (text.includes(normalizeFoodSearchQuery(query))) {
      score += 4;
    }
  }

  if (plan.mealType !== "meal") {
    if (text.includes(plan.mealType)) {
      score += 6;
    }
    if (plan.mealType === "breakfast" && /(idli|dosa|poha|upma|omelette|oats|yogurt|sandwich)/.test(text)) {
      score += 5;
    }
    if (plan.mealType === "snack" && /(chai|chana|sprouts|nuts|fruit|makhana)/.test(text)) {
      score += 5;
    }
  }

  if (plan.dietStyle === "vegan") {
    if (dietType !== "vegan") {
      score -= 20;
    } else {
      score += 5;
    }
  }
  if (plan.dietStyle === "vegetarian") {
    if (dietType === "non_vegetarian") {
      score -= 20;
    } else {
      score += 3;
    }
  }
  if (plan.dietStyle === "non_vegetarian") {
    if (dietType === "non_vegetarian") {
      score += 8;
    }
    if (dietType === "vegetarian") {
      score -= 1;
    }
    if (dietType === "vegan") {
      score -= 3;
    }
  }

  if (plan.promptSignals?.wantsVegetarian && /(chicken|mutton|fish|prawn|egg curry|meat|egg)/.test(text)) {
    score -= 8;
  }

  if (plan.promptSignals?.wantsHighProtein && typeof protein === "number") {
    score += protein >= 10 ? 5 : protein >= 7 ? 3 : 0;
  }

  if (plan.promptSignals?.wantsQuick && /(sandwich|oats|omelette|poha|upma|yogurt)/.test(text)) {
    score += 2;
  }

  if (plan.promptSignals?.wantsLight && /(salad|fruit|yogurt|sprouts|soup)/.test(text)) {
    score += 3;
  }

  if (plan.nutritionPriorities.includes("higher_protein_balanced_carbs") && typeof protein === "number") {
    score += protein >= 8 ? 4 : protein >= 5 ? 2 : 0;
  }
  if (plan.nutritionPriorities.includes("lower_glycemic_load")) {
    if (typeof carbs === "number") {
      score += carbs <= 25 ? 3 : carbs <= 35 ? 1 : 0;
      score -= carbs >= 45 ? 3 : 0;
    }
    if (typeof protein === "number") {
      score += protein >= 6 ? 2 : 0;
    }
  }
  if (plan.nutritionPriorities.includes("heart_healthy_fats") && typeof fat === "number") {
    score += fat < 18 ? 2 : 0;
  }
  if (plan.nutritionPriorities.includes("iron_supportive") && /(egg|sprout|paneer|chana|ragi|greens|rajma)/.test(text)) {
    score += 4;
  }
  if (plan.nutritionPriorities.includes("lower_sodium") && /(plain|home style|steamed|fresh)/.test(text)) {
    score += 2;
  }
  if (plan.nutritionPriorities.includes("kidney_friendly") && /(light|plain|fresh|fruit|oats|upma)/.test(text)) {
    score += 3;
  }

  if (typeof calories === "number") {
    if (plan.mealType === "breakfast" && calories >= 80 && calories <= 280) {
      score += 3;
    }
    if (plan.mealType === "breakfast" && calories > 420) {
      score -= 4;
    }
    if (plan.mealType === "snack" && calories <= 220) {
      score += 3;
    }
  }

  for (const avoid of plan.avoidTerms) {
    if (text.includes(normalize(avoid))) {
      score -= 6;
    }
  }

  if (Array.isArray(plan.recentFoodTitles) && plan.recentFoodTitles.some((title) => title && text.includes(title))) {
    score -= 5;
  }
  if (Array.isArray(plan.recentPlanTitles) && plan.recentPlanTitles.some((title) => title && text.includes(title))) {
    score -= 10;
  }

  if (isOwnedPrivateCustomFood) {
    score += Math.min(12, 3 + usageCount * 2);
  }

  if (plan.mealType === "breakfast") {
    if (plan.dietStyle === "non_vegetarian" && /(omelette|egg)/.test(text)) {
      score += 18;
    }
    if (/(fried|butter|sweet|dessert|biryani)/.test(text)) {
      score -= 6;
    }
    if (/(idli|dosa|poha|upma)/.test(text) && plan.nutritionPriorities.includes("lower_glycemic_load")) {
      score -= 3;
    }
    if (/(idli|dosa|poha|upma)/.test(text) && plan.promptSignals?.wantsLowSugar) {
      score -= 3;
    }
    if (/(omelette|egg|paneer|sprouts|oats|chilla|yogurt)/.test(text)) {
      score += 3;
    }
  }

  if (plan.mealType !== "breakfast" && plan.dietStyle === "non_vegetarian" && /(chicken|fish|egg curry|omelette|prawn)/.test(text)) {
    score += 10;
  }

  return score;
}

function getVarietyBucket(candidate) {
  const text = getCandidateText(candidate);
  const mealType = normalize(candidate?.metadata?.mealType || "");

  if (/(idli|dosa|appam|uttapam|dhokla|adai)/.test(text)) {
    return `${mealType || "meal"}_fermented_breakfast`;
  }
  if (/(upma|poha|oats|ragi|millet|porridge)/.test(text)) {
    return `${mealType || "meal"}_grain_base`;
  }
  if (/(paneer|tofu|egg|omelette|chicken|fish|dal|rajma|chole|chana|sprout|yogurt)/.test(text)) {
    return `${mealType || "meal"}_protein_forward`;
  }
  if (/(roti|chapati|phulka|paratha)/.test(text)) {
    return `${mealType || "meal"}_roti_plate`;
  }
  if (/(rice|biryani|pulao|pulav|curd rice|lemon rice|sambar rice|khichdi)/.test(text)) {
    return `${mealType || "meal"}_rice_plate`;
  }
  if (/(salad|bowl|sprouts|fruit|makhana|nuts|chaat)/.test(text)) {
    return `${mealType || "meal"}_light_bowl`;
  }
  if (/(curry|sabzi|subzi|stew|soup|sambar|rasam|kadhi)/.test(text)) {
    return `${mealType || "meal"}_saucy_main`;
  }

  return `${mealType || "meal"}_${candidate.source || "other"}`;
}

function formatPriorityLabel(priority) {
  return priority.replace(/_/g, " ");
}

function buildRecommendationReason(candidate, plan) {
  const text = normalize(candidate?.description);
  const reasons = [];

  if (plan.mealType === "breakfast" && /(idli|dosa|poha|upma|oats|omelette|yogurt)/.test(text)) {
    reasons.push("fits a breakfast-style meal");
  }
  if (plan.mealType === "snack" && /(fruit|chana|nuts|makhana|sprouts|yogurt)/.test(text)) {
    reasons.push("works as a lighter snack");
  }
  if (plan.nutritionPriorities.includes("higher_protein_balanced_carbs") && /(paneer|egg|chicken|fish|dal|chana|sprout|yogurt)/.test(text)) {
    reasons.push("helps close your protein gap");
  }
  if (plan.nutritionPriorities.includes("lower_glycemic_load") && /(dal|chana|paneer|sprout|oats|millet|upma|idli)/.test(text)) {
    reasons.push("supports steadier blood sugar");
  }
  if (plan.nutritionPriorities.includes("iron_supportive") && /(ragi|greens|rajma|chana|paneer|egg)/.test(text)) {
    reasons.push("supports iron-focused eating");
  }
  if (plan.nutritionPriorities.includes("lower_sodium") && /(plain|home style|fresh|steamed)/.test(text)) {
    reasons.push("keeps sodium lighter");
  }

  if (reasons.length === 0) {
    reasons.push("matches your prompt and current nutrition priorities");
  }

  return reasons.slice(0, 2).join(", ");
}

function buildServingSuggestion(candidate, plan) {
  const text = normalize(candidate?.description);
  if (/(idli|dosa|roti|chapati|egg|omelette|toast)/.test(text)) {
    return "Start with 1 to 2 pieces and adjust to hunger.";
  }
  if (/(dal|sabzi|curd|yogurt|oats|poha|upma|khichdi)/.test(text)) {
    return "Start with 1 bowl or katori and adjust to your day.";
  }
  if (plan.mealType === "snack") {
    return "Keep this to 1 light serving between meals.";
  }
  return "Start with 1 serving and adjust to your daily calorie target.";
}

function localChooseMeals({ candidates, plan }) {
  const compatibleCandidates = candidates.filter((candidate) => isCandidateCompatibleWithDiet(candidate, plan.dietStyle));
  const sourceCandidates = compatibleCandidates.length > 0 ? compatibleCandidates : candidates;
  const ranked = sourceCandidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, plan) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const selected = [];
  const usedTitles = new Set();
  const usedBuckets = new Set();
  const recentPlanTitles = new Set((plan.recentPlanTitles || []).filter(Boolean));
  const sourceCounts = new Map();

  for (const item of ranked) {
    const normalizedTitle = normalize(item.candidate.description);
    const bucket = getVarietyBucket(item.candidate);
    const source = item.candidate.source || "other";
    const currentSourceCount = sourceCounts.get(source) || 0;

    if (usedTitles.has(normalizedTitle)) {
      continue;
    }
    if (recentPlanTitles.has(normalizedTitle) && selected.length < 4) {
      continue;
    }
    if (selected.length >= 2 && currentSourceCount >= 2) {
      continue;
    }

    if (selected.length < 3 || !usedBuckets.has(bucket)) {
      selected.push(item);
      usedTitles.add(normalizedTitle);
      usedBuckets.add(bucket);
      sourceCounts.set(source, currentSourceCount + 1);
    }

    if (selected.length === 5) {
      break;
    }
  }

  const finalItems = selected.length > 0 ? selected : ranked.slice(0, 5);

  return {
    provider: "local",
    summary: `Recommendations were generated with local rule-based ranking for ${plan.mealType}. Priorities considered: ${
      plan.nutritionPriorities.map(formatPriorityLabel).join(", ") || "general balance"
    }.`,
    recommendations: finalItems.map(({ candidate }) => ({
      foodId: candidate.fdcId,
      title: candidate.description,
      whyItFits: buildRecommendationReason(candidate, plan),
      servingSuggestion: buildServingSuggestion(candidate, plan),
      cautions: plan.avoidTerms
    }))
  };
}

module.exports = {
  localRecommendationPlan,
  localChooseMeals
};
