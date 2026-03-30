import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Screen } from "@/components/Screen";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/AsyncState";
import {
  createMealLog,
  generateMealPlan,
  getDashboard,
  getMealPlans,
  getMedicalRecords,
  getPlannerCatalogMeals,
  getProfile,
  submitPlannerFeedback
} from "@/lib/api";
import { syncMealReminderSchedule } from "@/lib/notifications";
import { DashboardResponse, MealPlan, MedicalRecord, PlannerCatalogMeal, Profile } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

type MealType = "breakfast" | "lunch" | "snack" | "dinner";
type DietStyle = "vegan" | "vegetarian" | "non_vegetarian";
type DayFoodStyle = "profile" | "veg" | "egg" | "non_veg";

type PlanMealChoice = {
  title: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSuggestion: string;
  whyItFits: string;
  source?: string;
  tags?: string[];
  cuisineTags?: string[];
  nutritionConfidence?: "high" | "medium" | "low";
  recipe?: {
    ingredients: string[];
    instructions: string[];
  } | null;
};

type PlanMeal = PlanMealChoice & {
  mealType: MealType;
  options: PlanMealChoice[];
  foodId?: string;
};

type GroceryCategory = "Proteins" | "Vegetables & Fruits" | "Grains & Staples" | "Dairy & Eggs" | "Others";

type GroceryListItem = {
  key: string;
  label: string;
  category: GroceryCategory;
  meals: string[];
};

type MealArt = {
  colors: [string, string];
  emoji: string;
  accents: string[];
};

type PlannerDraftState = {
  mealSelections: Record<string, number>;
  approvedMeals: Record<string, boolean>;
  dayFoodStyles: Record<string, DayFoodStyle>;
};

function isConnectionishError(error: unknown) {
  const message = String((error as Error)?.message || error || "");
  return /Connection issue|Server timeout|Network request failed|Load failed|fetch failed/i.test(message);
}

const PLANNER_DRAFT_KEY = "apollostay-planner-draft-v1";

const mealTargetShares: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  snack: 0.12,
  dinner: 0.28
};

const mealOrder: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

type MealTemplate = {
  mealType: MealType;
  title: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSuggestion: string;
  tags: string[];
  cuisineTags: string[];
  diets: DietStyle[];
  source: string;
  nutritionConfidence: "high" | "medium" | "low";
  popularityScore?: number;
  foodId?: string;
  recipe?: {
    ingredients: string[];
    instructions: string[];
  } | null;
};

const mealBadge: Record<MealType, { label: string; bg: string; text: string }> = {
  breakfast: { label: "AM", bg: "#DBEAFE", text: "#1D4ED8" },
  lunch: { label: "LN", bg: "#DCFCE7", text: "#15803D" },
  snack: { label: "SN", bg: "#FEF3C7", text: "#B45309" },
  dinner: { label: "PM", bg: "#EDE9FE", text: "#7C3AED" }
};

const mealVisuals: Record<MealType, { icon: keyof typeof Ionicons.glyphMap; colors: [string, string] }> = {
  breakfast: { icon: "sunny-outline", colors: ["#FFF7ED", "#FDE68A"] },
  lunch: { icon: "leaf-outline", colors: ["#ECFCCB", "#86EFAC"] },
  snack: { icon: "cafe-outline", colors: ["#FEF3C7", "#FDBA74"] },
  dinner: { icon: "moon-outline", colors: ["#E0E7FF", "#A5B4FC"] }
};

const dayFoodStyleLabels: Record<DayFoodStyle, string> = {
  profile: "Profile",
  veg: "Veg",
  egg: "Egg",
  non_veg: "Non-veg"
};

const planPriorityLabels: Record<string, string> = {
  prioritize_lower_glycemic_load: "Lower glycemic load",
  support_iron_intake: "Iron support",
  prefer_lower_sodium_meals: "Lower sodium",
  prefer_heart_healthy_fats: "Heart-healthy fats",
  monitor_kidney_friendly_meals: "Kidney-friendly meals",
  monitor_thyroid_related_nutrition: "Thyroid-aware meals"
};

function normalizeCatalogPlannerTag(tag: string) {
  const value = String(tag || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!value) {
    return null;
  }

  if (/high_protein|protein_forward|protein_rich/.test(value)) return "high_protein";
  if (/low_glycemic|lower_glycemic|steady_energy|blood_sugar/.test(value)) return "low_glycemic";
  if (/iron|iron_support|iron_supportive/.test(value)) return "iron_support";
  if (/low_sodium|lower_sodium/.test(value)) return "low_sodium";
  if (/heart_healthy|heart_friendlier|heart_friendly/.test(value)) return "heart_healthy";
  if (/kidney_friendly/.test(value)) return "kidney_friendly";
  if (/thyroid/.test(value)) return "thyroid_support";
  if (/egg/.test(value)) return "egg_friendly";
  if (/quick|fast|easy/.test(value)) return "quick";
  if (/light|gentle/.test(value)) return "light";
  return value;
}

function inferCatalogMealDiets(item: PlannerCatalogMeal): DietStyle[] {
  const text = [item.title, item.description, item.tags.join(" "), item.cuisineTags.join(" ")]
    .join(" ")
    .toLowerCase();

  if (/(chicken|fish|mutton|prawn|shrimp|meat|egg|omelette|egg curry)/.test(text)) {
    return ["non_vegetarian"];
  }
  if (/(paneer|curd|yogurt|milk|cheese|dairy|vegetarian)/.test(text)) {
    return ["vegetarian"];
  }
  return ["vegan", "vegetarian"];
}

function mapCatalogMealToTemplate(item: PlannerCatalogMeal): MealTemplate | null {
  const mealType = String(item.mealType || "").toLowerCase() as MealType;
  if (!mealOrder.includes(mealType)) {
    return null;
  }

  const tags = Array.from(
    new Set((item.tags || []).map(normalizeCatalogPlannerTag).filter(Boolean) as string[])
  );

  return {
    mealType,
    title: item.title,
    description: item.description,
    calories: Math.round(Number(item.calories || 0)),
    protein: Math.round(Number(item.protein || 0)),
    carbs: Math.round(Number(item.carbs || 0)),
    fat: Math.round(Number(item.fat || 0)),
    servingSuggestion: item.servingSuggestion || "1 serving",
    tags,
    cuisineTags: item.cuisineTags || [],
    diets: inferCatalogMealDiets(item),
    source: item.source,
    nutritionConfidence: item.nutritionConfidence || "medium",
    popularityScore: item.popularityScore || 0,
    foodId: item.id,
    recipe: item.recipe || null
  };
}

function buildPlannerMealPool(catalogMeals: PlannerCatalogMeal[]) {
  const catalogTemplates = catalogMeals.map(mapCatalogMealToTemplate).filter(Boolean) as MealTemplate[];
  const seen = new Set<string>();
  return catalogTemplates
    .sort((left, right) => {
      const sourceDelta = getSourcePriority(right.source) - getSourcePriority(left.source);
      if (sourceDelta !== 0) {
        return sourceDelta;
      }

      const confidenceValue = (value: MealTemplate["nutritionConfidence"]) =>
        value === "high" ? 2 : value === "medium" ? 1 : 0;
      const confidenceDelta = confidenceValue(right.nutritionConfidence) - confidenceValue(left.nutritionConfidence);
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      return Number(right.popularityScore || 0) - Number(left.popularityScore || 0);
    })
    .filter((item) => {
      const key = `${item.mealType}:${item.title.trim().toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function buildWeekDays() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      dateKey: formatDateKey(date),
      dayName: date.toLocaleDateString(undefined, { weekday: "short" }),
      dayNum: date.getDate()
    };
  });
}

function getTodayDateKey() {
  return formatDateKey(new Date());
}

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMealIdentity(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function getSourcePriority(source?: string) {
  const normalized = normalizeText(source || "");
  if (normalized === "reviewed-learning") return 6;
  if (normalized === "reviewed_catalog") return 5;
  if (normalized === "catalog") return 4;
  if (normalized === "indian-meals") return 3;
  if (normalized === "indian-nutrition") return 2;
  if (normalized === "fndds") return 1;
  return 0;
}

function extractMealVarietyKey(input: Pick<MealTemplate, "title" | "tags" | "cuisineTags"> | string) {
  const rawTitle = typeof input === "string" ? input : input.title;
  const normalizedTitle = normalizeMealIdentity(rawTitle);
  const stopWords = new Set(["with", "and", "style", "plate", "bowl", "meal", "fresh", "simple", "served"]);
  const titleTokens = normalizedTitle.split(" ").filter((token) => token.length > 2 && !stopWords.has(token));

  if (titleTokens.length > 0) {
    return titleTokens.slice(0, 2).join(" ");
  }

  if (typeof input !== "string") {
    const fallbackTag = [...input.tags, ...input.cuisineTags].find(Boolean);
    if (fallbackTag) {
      return normalizeMealIdentity(fallbackTag);
    }
  }

  return normalizedTitle;
}

function findLatestMetric(records: MedicalRecord[], pattern: RegExp) {
  for (const record of records) {
    const vital = record.extracted.vitals.find((item) => pattern.test(item.name));
    if (vital?.value !== null && vital?.value !== undefined) {
      return `${vital.value}${vital.unit ? ` ${vital.unit}` : ""}`;
    }

    const lab = record.extracted.labResults.find((item) => pattern.test(item.name));
    if (lab?.value !== null && lab?.value !== undefined) {
      return `${lab.value}${lab.unit ? ` ${lab.unit}` : ""}`;
    }
  }

  return "No report value";
}

function findLatestNumeric(records: MedicalRecord[], pattern: RegExp) {
  for (const record of records) {
    const vital = record.extracted.vitals.find((item) => pattern.test(item.name));
    const vitalValue = Number(vital?.value);
    if (Number.isFinite(vitalValue)) {
      return vitalValue;
    }

    const lab = record.extracted.labResults.find((item) => pattern.test(item.name));
    const labValue = Number(lab?.value);
    if (Number.isFinite(labValue)) {
      return labValue;
    }
  }

  return null;
}

function inferMealTypesFromCurrentTime(now = new Date()) {
  const hour = now.getHours();
  if (hour < 10) {
    return mealOrder;
  }
  if (hour < 14) {
    return ["lunch", "snack", "dinner"] as MealType[];
  }
  if (hour < 17) {
    return ["snack", "dinner"] as MealType[];
  }
  return ["dinner"] as MealType[];
}

function inferDietStyle(profile: Profile | null) {
  const prefs = (profile?.dietaryPreferences || []).map(normalizeText);
  if (prefs.some((item) => item.includes("vegan"))) {
    return "vegan" as DietStyle;
  }
  if (prefs.some((item) => item.includes("non") && item.includes("veg"))) {
    return "non_vegetarian" as DietStyle;
  }
  return "vegetarian" as DietStyle;
}

function resolveEffectiveDietStyle(profileDietStyle: DietStyle, dayFoodStyle: DayFoodStyle) {
  if (dayFoodStyle === "profile") {
    return profileDietStyle;
  }
  if (dayFoodStyle === "veg") {
    return "vegetarian" as DietStyle;
  }
  if (dayFoodStyle === "non_veg") {
    return "non_vegetarian" as DietStyle;
  }
  return profileDietStyle;
}

function collectContext(profile: Profile | null, records: MedicalRecord[]) {
  const flags = new Set<string>();
  const conditions = new Set<string>();

  for (const item of profile?.medicalConditions || []) {
    conditions.add(normalizeText(item));
  }
  for (const item of profile?.clinicalMetrics?.reportDerivedConditions || []) {
    conditions.add(normalizeText(item));
  }

  for (const record of records) {
    for (const item of record.extracted.dietaryFlags || []) {
      flags.add(item);
    }
    for (const item of record.extracted.diagnoses || []) {
      conditions.add(normalizeText(item));
    }
  }

  const hba1c = findLatestNumeric(records, /hba1c/i);
  const glucose = findLatestNumeric(records, /glucose/i);
  const hemoglobin = findLatestNumeric(records, /hemoglobin|hb$/i);
  const creatinine = findLatestNumeric(records, /creatinine/i);
  const tsh = findLatestNumeric(records, /tsh/i);
  const cholesterol = findLatestNumeric(records, /cholesterol/i);
  const ldl = findLatestNumeric(records, /^ldl/i);

  if ((hba1c !== null && hba1c >= 5.7) || (glucose !== null && glucose >= 100)) {
    flags.add("prioritize_lower_glycemic_load");
  }
  if (hemoglobin !== null && hemoglobin < 12) {
    flags.add("support_iron_intake");
  }
  if (creatinine !== null && creatinine > 1.2) {
    flags.add("monitor_kidney_friendly_meals");
  }
  if (tsh !== null && tsh > 4.5) {
    flags.add("monitor_thyroid_related_nutrition");
  }
  if ((cholesterol !== null && cholesterol >= 200) || (ldl !== null && ldl >= 130)) {
    flags.add("prefer_heart_healthy_fats");
  }
  if (Array.from(conditions).some((item) => item.includes("hypertension") || item.includes("blood pressure"))) {
    flags.add("prefer_lower_sodium_meals");
  }

  return {
    flags: Array.from(flags),
    conditions: Array.from(conditions),
    recordCount: records.length
  };
}

function getMealSeed(dateKey: string, mealType: MealType, dayFoodStyle: DayFoodStyle, version: number) {
  return `${dateKey}-${mealType}-${dayFoodStyle}-${version}`
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
}

function supportsDayFoodStyle(template: MealTemplate, effectiveDietStyle: DietStyle, dayFoodStyle: DayFoodStyle) {
  if (effectiveDietStyle === "vegan") {
    return template.diets.includes("vegan");
  }

  if (dayFoodStyle === "veg") {
    return template.diets.includes("vegan") || template.diets.includes("vegetarian");
  }

  if (dayFoodStyle === "egg") {
    return (
      template.tags.includes("egg_friendly") ||
      template.diets.includes("vegan") ||
      template.diets.includes("vegetarian")
    );
  }

  if (effectiveDietStyle === "vegetarian") {
    return template.diets.includes("vegan") || template.diets.includes("vegetarian");
  }

  return true;
}

function scoreTemplate(
  template: MealTemplate,
  context: ReturnType<typeof collectContext>,
  effectiveDietStyle: DietStyle,
  dayFoodStyle: DayFoodStyle
) {
  if (!supportsDayFoodStyle(template, effectiveDietStyle, dayFoodStyle)) {
    return -999;
  }

  let score = 1;
  const tags = template.tags;

  if (dayFoodStyle === "egg" && tags.includes("egg_friendly")) {
    score += 8;
  }
  if (dayFoodStyle === "non_veg" && template.diets.includes("non_vegetarian")) {
    score += 8;
  }
  if (dayFoodStyle === "veg" && (template.diets.includes("vegetarian") || template.diets.includes("vegan"))) {
    score += 8;
  }

  if (context.flags.includes("prioritize_lower_glycemic_load") && tags.includes("low_glycemic")) {
    score += 4;
  }
  if (context.flags.includes("support_iron_intake") && tags.includes("iron_support")) {
    score += 4;
  }
  if (context.flags.includes("prefer_lower_sodium_meals") && tags.includes("low_sodium")) {
    score += 3;
  }
  if (context.flags.includes("prefer_heart_healthy_fats") && tags.includes("heart_healthy")) {
    score += 3;
  }
  if (context.flags.includes("monitor_kidney_friendly_meals") && tags.includes("kidney_friendly")) {
    score += 3;
  }
  if (context.flags.includes("monitor_thyroid_related_nutrition") && tags.includes("thyroid_support")) {
    score += 2;
  }
  if (context.conditions.some((item) => item.includes("anemia")) && tags.includes("iron_support")) {
    score += 3;
  }
  if (context.conditions.some((item) => item.includes("diabet")) && tags.includes("low_glycemic")) {
    score += 4;
  }
  if (tags.includes("high_protein")) {
    score += 1;
  }

  return score;
}

function buildPlanMeal(
  dateKey: string,
  mealType: MealType,
  context: ReturnType<typeof collectContext>,
  effectiveDietStyle: DietStyle,
  dayFoodStyle: DayFoodStyle,
  version: number,
  templates: MealTemplate[],
  recentTitles: Set<string>,
  recentVarietyKeys: Set<string>
): PlanMeal | null {
  const choices = templates
    .filter((template) => template.mealType === mealType)
    .map((template) => ({ template, score: scoreTemplate(template, context, effectiveDietStyle, dayFoodStyle) }))
    .filter((item) => item.score > -100)
    .sort((left, right) => {
      const leftVarietyKey = extractMealVarietyKey(left.template);
      const rightVarietyKey = extractMealVarietyKey(right.template);
      const leftRepeated = recentTitles.has(normalizeMealIdentity(left.template.title)) ? 1 : 0;
      const rightRepeated = recentTitles.has(normalizeMealIdentity(right.template.title)) ? 1 : 0;
      if (leftRepeated !== rightRepeated) {
        return leftRepeated - rightRepeated;
      }

      const leftVarietyRepeated = recentVarietyKeys.has(leftVarietyKey) ? 1 : 0;
      const rightVarietyRepeated = recentVarietyKeys.has(rightVarietyKey) ? 1 : 0;
      if (leftVarietyRepeated !== rightVarietyRepeated) {
        return leftVarietyRepeated - rightVarietyRepeated;
      }

      const sourceDelta = getSourcePriority(right.template.source) - getSourcePriority(left.template.source);
      if (sourceDelta !== 0) {
        return sourceDelta;
      }

      const popularityDelta = Number(right.template.popularityScore || 0) - Number(left.template.popularityScore || 0);
      if (popularityDelta !== 0) {
        return popularityDelta;
      }

      return right.score - left.score;
    });

  if (choices.length === 0) {
    return null;
  }

  const preferredChoices =
    dayFoodStyle === "egg"
      ? choices.filter((item) => item.template.tags.includes("egg_friendly"))
      : dayFoodStyle === "non_veg"
        ? choices.filter((item) => item.template.diets.includes("non_vegetarian"))
        : dayFoodStyle === "veg"
          ? choices.filter(
              (item) => item.template.diets.includes("vegetarian") || item.template.diets.includes("vegan")
            )
          : choices;

  const activePool = preferredChoices.length > 0 ? preferredChoices : choices;
  const rotationPool = activePool.slice(0, Math.min(activePool.length, 6));
  const choiceOptions = rotationPool.map((item) => {
    const whyItFitsParts = [];
    if (context.flags.includes("prioritize_lower_glycemic_load") && item.template.tags.includes("low_glycemic")) {
      whyItFitsParts.push("supports steadier blood sugar");
    }
    if (context.flags.includes("support_iron_intake") && item.template.tags.includes("iron_support")) {
      whyItFitsParts.push("supports iron intake");
    }
    if (context.flags.includes("prefer_lower_sodium_meals") && item.template.tags.includes("low_sodium")) {
      whyItFitsParts.push("keeps sodium lighter");
    }
    if (context.flags.includes("prefer_heart_healthy_fats") && item.template.tags.includes("heart_healthy")) {
      whyItFitsParts.push("uses heart-friendlier fats");
    }
    if (context.flags.includes("monitor_kidney_friendly_meals") && item.template.tags.includes("kidney_friendly")) {
      whyItFitsParts.push("keeps the meal gentler on kidney-related goals");
    }
    if (whyItFitsParts.length === 0) {
      whyItFitsParts.push("matches your current calorie target and recorded health context");
    }

    return {
      title: item.template.title,
      description: item.template.description,
      calories: item.template.calories,
      protein: item.template.protein,
      carbs: item.template.carbs,
      fat: item.template.fat,
      servingSuggestion: item.template.servingSuggestion,
      whyItFits: whyItFitsParts.join(", "),
      source: item.template.source,
      tags: item.template.tags,
      cuisineTags: item.template.cuisineTags,
      nutritionConfidence: item.template.nutritionConfidence,
      recipe: item.template.recipe || null
    };
  });

  const selectedIndex = getMealSeed(dateKey, mealType, dayFoodStyle, version) % choiceOptions.length;
  const orderedOptions = [
    choiceOptions[selectedIndex],
    ...choiceOptions.filter((_, index) => index !== selectedIndex)
  ];
  const chosen = orderedOptions[0];

  return {
    mealType,
    ...chosen,
    options: orderedOptions,
    foodId: activePool[selectedIndex]?.template.foodId
  };
}

function buildAutoPlan(
  dateKey: string,
  profile: Profile | null,
  records: MedicalRecord[],
  dayFoodStyle: DayFoodStyle,
  version: number,
  dashboard: DashboardResponse | null,
  templates: MealTemplate[],
  recentTitles: Set<string>
) {
  const context = collectContext(profile, records);
  const profileDietStyle = inferDietStyle(profile);
  const effectiveDietStyle = resolveEffectiveDietStyle(profileDietStyle, dayFoodStyle);
  const isToday = dateKey === getTodayDateKey();
  const loggedMeals = new Set<MealType>(
    isToday
      ? (dashboard?.mealBreakdown || [])
          .filter((item) => Number(item.summary?.itemCount || 0) > 0)
          .map((item) => item.mealType as MealType)
      : []
  );
  const timeSuggestedMeals = isToday ? inferMealTypesFromCurrentTime() : mealOrder;
  const remainingMealTypes = mealOrder.filter((mealType) => {
    if (loggedMeals.has(mealType)) {
      return false;
    }
    if (!isToday) {
      return true;
    }
    if ((dashboard?.summary?.mealCount || 0) > 0) {
      return true;
    }
    return timeSuggestedMeals.includes(mealType);
  });
  const activeMealTypes: MealType[] = remainingMealTypes.length > 0 ? remainingMealTypes : ["snack", "dinner"];
  const usedTitles = new Set(Array.from(recentTitles));
  const usedVarietyKeys = new Set(Array.from(recentTitles).map((title) => extractMealVarietyKey(title)));

  const meals = activeMealTypes
    .map((mealType) => {
      const meal = buildPlanMeal(
        dateKey,
        mealType,
        context,
        effectiveDietStyle,
        dayFoodStyle,
        version,
        templates,
        usedTitles,
        usedVarietyKeys
      );
      if (meal) {
        usedTitles.add(normalizeMealIdentity(meal.title));
        usedVarietyKeys.add(extractMealVarietyKey(meal.title));
      }
      return meal;
    })
    .filter(Boolean) as PlanMeal[];

  const baseTotals = meals.reduce(
    (accumulator, meal) => {
      accumulator.calories += meal.calories;
      accumulator.protein += meal.protein;
      accumulator.carbs += meal.carbs;
      accumulator.fat += meal.fat;
      return accumulator;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const dailyTarget = Number(profile?.dailyCalorieTarget || 2000);
  const remainingCaloriesTarget = isToday
    ? Math.max(250, Number(dashboard?.summary?.remainingCalories ?? dailyTarget))
    : dailyTarget;
  const activeShareTotal = activeMealTypes.reduce((sum, mealType) => sum + mealTargetShares[mealType], 0) || 1;
  const maxScaleMultiplier = activeMealTypes.length === 1 ? 3.2 : activeMealTypes.length === 2 ? 2.4 : 1.8;
  const scaledMeals = meals.map((meal) => {
    const selectedChoice = meal.options[0] || meal;
    const targetCalories = Math.round(remainingCaloriesTarget * (mealTargetShares[meal.mealType] / activeShareTotal));
    const scale = selectedChoice.calories > 0 ? targetCalories / selectedChoice.calories : 1;
    const roundedScale = Math.max(0.8, Math.min(maxScaleMultiplier, scale));
    const portionMultiplier = Math.round(roundedScale * 10) / 10;
    const scaleChoice = (choice: PlanMealChoice): PlanMealChoice => ({
      ...choice,
      calories: Math.round(choice.calories * roundedScale),
      protein: Math.round(choice.protein * roundedScale),
      carbs: Math.round(choice.carbs * roundedScale),
      fat: Math.round(choice.fat * roundedScale),
      servingSuggestion:
        portionMultiplier === 1
          ? choice.servingSuggestion
          : `${portionMultiplier}x ${choice.servingSuggestion}`
    });

    const scaledOptions = meal.options.map(scaleChoice);
    const scaledSelected = scaledOptions[0] || scaleChoice(meal);

    return {
      ...meal,
      ...scaledSelected,
      options: scaledOptions
    };
  });

  const totals = scaledMeals.reduce(
    (accumulator, meal) => {
      accumulator.calories += meal.calories;
      accumulator.protein += meal.protein;
      accumulator.carbs += meal.carbs;
      accumulator.fat += meal.fat;
      return accumulator;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const priorities = [];
  if (context.flags.includes("prioritize_lower_glycemic_load")) priorities.push("lower glycemic load");
  if (context.flags.includes("support_iron_intake")) priorities.push("iron support");
  if (context.flags.includes("prefer_lower_sodium_meals")) priorities.push("lower sodium");
  if (context.flags.includes("prefer_heart_healthy_fats")) priorities.push("heart-healthy fats");
  if (context.flags.includes("monitor_kidney_friendly_meals")) priorities.push("kidney-friendly meals");
  if (context.flags.includes("monitor_thyroid_related_nutrition")) priorities.push("thyroid-aware nutrition");

  return {
    meals: scaledMeals,
    totals,
    notes:
      priorities.length > 0
        ? `Built from your saved profile and parsed records. Active priorities: ${priorities.join(", ")}. Adjusted to aim for about ${remainingCaloriesTarget} kcal across the remaining meals${activeMealTypes.length <= 2 ? ", with larger portions because only a small number of meals are left today" : ""}.`
        : `Built from your saved profile and parsed records, with a balanced focus on steady energy and about ${remainingCaloriesTarget} kcal across the remaining meals${activeMealTypes.length <= 2 ? ", using larger portions because only a small number of meals are left today" : ""}.`,
    context,
    dietStyle: effectiveDietStyle,
    dayFoodStyle,
    dailyTarget,
    baseTotals,
    remainingCaloriesTarget,
    activeMealTypes,
    loggedMeals: Array.from(loggedMeals)
  };
}

function buildPlanPrompt(dayFoodStyle: DayFoodStyle, profile?: Profile | null) {
  const promptParts = [];

  if (dayFoodStyle === "veg") {
    promptParts.push("Generate a vegetarian meal plan with practical portions and realistic foods.");
  } else if (dayFoodStyle === "egg") {
    promptParts.push("Generate a meal plan that can include egg-based meals while staying practical and health-aware.");
  } else if (dayFoodStyle === "non_veg") {
    promptParts.push("Generate a non-vegetarian meal plan with practical portions and realistic foods.");
  } else {
    promptParts.push("Generate a balanced meal plan.");
  }

  if (profile?.likedFoods?.length) {
    promptParts.push(`Prefer foods like ${profile.likedFoods.slice(0, 6).join(", ")} when they fit the plan.`);
  }

  if (profile?.dislikedFoods?.length) {
    promptParts.push(`Avoid or minimize foods such as ${profile.dislikedFoods.slice(0, 6).join(", ")}.`);
  }

  if (profile?.mealsPerDay) {
    promptParts.push(`Shape the day around about ${profile.mealsPerDay} eating occasions.`);
  }

  if (profile?.mealTimes) {
    const timing = [
      profile.mealTimes.breakfast ? `breakfast around ${profile.mealTimes.breakfast}` : null,
      profile.mealTimes.lunch ? `lunch around ${profile.mealTimes.lunch}` : null,
      profile.mealTimes.dinner ? `dinner around ${profile.mealTimes.dinner}` : null,
      profile.mealTimes.snack && (profile.mealsPerDay || 0) >= 4 ? `snack around ${profile.mealTimes.snack}` : null
    ]
      .filter(Boolean)
      .join(", ");

    if (timing) {
      promptParts.push(`Use this daily rhythm: ${timing}.`);
    }
  }

  return promptParts.join(" ");
}

function mapSavedPlanToUi(plan: MealPlan, selectedIndexes: Record<string, number>) {
  const meals = plan.meals.map((meal) => {
    const options = [meal, ...(meal.alternatives || [])];
    const selectedIndex = selectedIndexes[meal.mealType] ?? 0;
    const chosen = options[selectedIndex] || options[0];

    return {
      mealType: meal.mealType as MealType,
      title: chosen.title,
      description: meal.description,
      calories: chosen.calories ?? 0,
      protein: chosen.protein ?? 0,
      carbs: chosen.carbs ?? 0,
      fat: chosen.fat ?? 0,
      servingSuggestion: chosen.servingSuggestion,
      whyItFits: chosen.whyItFits,
      cautions: chosen.cautions || [],
      foodId: chosen.foodId || meal.foodId,
      recipe: chosen.recipe || meal.recipe || null,
      options: options.map((option) => ({
        title: option.title,
        description: meal.description,
        calories: option.calories ?? 0,
        protein: option.protein ?? 0,
        carbs: option.carbs ?? 0,
        fat: option.fat ?? 0,
        servingSuggestion: option.servingSuggestion,
        whyItFits: option.whyItFits,
        cautions: option.cautions || [],
        recipe: option.recipe || null
      }))
    };
  });

  return {
    meals,
    totals: plan.totals,
    notes: plan.aiNotes,
    provider: plan.provider,
    context: {
      recordCount: plan.medicalContext.recordCount,
      flags: [],
      conditions: []
    }
  };
}

function applyMealSelectionsToPlan<
  TPlan extends {
    meals: Array<
      PlanMeal & {
        options: PlanMealChoice[];
      }
    >;
  }
>(plan: TPlan, dateKey: string, selectedIndexes: Record<string, number>) {
  return {
    ...plan,
    meals: plan.meals.map((meal) => {
      const selectedIndex = selectedIndexes[`${dateKey}:${meal.mealType}`] ?? 0;
      const selectedChoice = meal.options[selectedIndex] || meal.options[0] || meal;
      return {
        ...meal,
        ...selectedChoice
      };
    })
  };
}

function normalizeIngredientLabel(input: string) {
  return input
    .replace(/\([^)]*\)/g, "")
    .replace(/\b\d+(\.\d+)?\s?(g|kg|ml|l|cup|cups|tbsp|tsp|piece|pieces|slice|slices|serving|servings)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function categorizeIngredient(label: string): GroceryCategory {
  const value = label.toLowerCase();
  if (/(egg|paneer|tofu|chicken|fish|yogurt|curd|milk|cheese|dal|lentil|bean|chana|rajma|nut|seed|soy)/.test(value)) {
    return /(milk|curd|yogurt|cheese|paneer|egg)/.test(value) ? "Dairy & Eggs" : "Proteins";
  }
  if (/(rice|roti|bread|oat|quinoa|millet|flour|poha|idli|dosa|pasta|noodle)/.test(value)) {
    return "Grains & Staples";
  }
  if (/(spinach|tomato|onion|cucumber|carrot|pepper|capsicum|lettuce|leaf|broccoli|banana|apple|berry|fruit|vegetable|mushroom|lime|lemon|orange|avocado)/.test(value)) {
    return "Vegetables & Fruits";
  }
  return "Others";
}

function buildShoppingList(meals: Array<PlanMeal & { foodId?: string }>) {
  const grouped = new Map<string, GroceryListItem>();

  for (const meal of meals) {
    const ingredients = meal.recipe?.ingredients || [];
    for (const ingredient of ingredients) {
      const normalized = normalizeIngredientLabel(ingredient);
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.meals.includes(meal.title)) {
          existing.meals.push(meal.title);
        }
      } else {
        grouped.set(key, {
          key,
          label: normalized,
          category: categorizeIngredient(normalized),
          meals: [meal.title]
        });
      }
    }
  }

  const categories: GroceryCategory[] = ["Proteins", "Vegetables & Fruits", "Grains & Staples", "Dairy & Eggs", "Others"];
  return categories
    .map((category) => ({
      category,
      items: Array.from(grouped.values())
        .filter((item) => item.category === category)
        .sort((left, right) => left.label.localeCompare(right.label))
    }))
    .filter((group) => group.items.length > 0);
}

function getMealArtwork(meal: Pick<PlanMeal, "title" | "description" | "mealType">): MealArt {
  const source = `${meal.title} ${meal.description}`.toLowerCase();

  if (/(egg|omelette|scramble)/.test(source)) {
    return { colors: ["#FFF7ED", "#FDBA74"], emoji: "🍳", accents: ["🥚", "🍄", "🥬"] };
  }
  if (/(fish|salmon|seafood|shrimp)/.test(source)) {
    return { colors: ["#E0F2FE", "#7DD3FC"], emoji: "🐟", accents: ["🍋", "🥬", "🍚"] };
  }
  if (/(chicken|grilled chicken)/.test(source)) {
    return { colors: ["#FEF3C7", "#F59E0B"], emoji: "🍗", accents: ["🥗", "🍚", "🥒"] };
  }
  if (/(paneer|cheese)/.test(source)) {
    return { colors: ["#FEF2F2", "#FCA5A5"], emoji: "🧀", accents: ["🫓", "🥬", "🍅"] };
  }
  if (/(tofu)/.test(source)) {
    return { colors: ["#ECFCCB", "#86EFAC"], emoji: "🧆", accents: ["🥬", "🍋", "🫓"] };
  }
  if (/(dal|rajma|bean|chana|lentil|khichdi)/.test(source)) {
    return { colors: ["#FEF3C7", "#FCD34D"], emoji: "🍛", accents: ["🫘", "🍚", "🥕"] };
  }
  if (/(yogurt|curd|raita)/.test(source)) {
    return { colors: ["#EFF6FF", "#BFDBFE"], emoji: "🥣", accents: ["🫐", "🥛", "🥄"] };
  }
  if (/(salad|greens|vegetable|spinach|broccoli)/.test(source)) {
    return { colors: ["#DCFCE7", "#86EFAC"], emoji: "🥗", accents: ["🥬", "🥒", "🍅"] };
  }
  if (/(oat|oats|breakfast bowl)/.test(source)) {
    return { colors: ["#FFF7ED", "#FED7AA"], emoji: "🥣", accents: ["🍌", "🥜", "🌾"] };
  }

  return { colors: mealVisuals[meal.mealType].colors, emoji: "🍽️", accents: ["✨", "🥄", "🥗"] };
}

function normalizeSecureStoreKeyPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .slice(0, 80);
}

function getPlannerDraftKey(profile: Profile | null) {
  const identity = profile?.email ? normalizeSecureStoreKeyPart(profile.email) : "guest";
  return `${PLANNER_DRAFT_KEY}_${identity}`;
}

async function loadPlannerDraft(profile: Profile | null) {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(getPlannerDraftKey(profile));
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PlannerDraftState;
  } catch {
    return null;
  }
}

async function savePlannerDraft(profile: Profile | null, draft: PlannerDraftState) {
  try {
    await SecureStore.setItemAsync(getPlannerDraftKey(profile), JSON.stringify(draft));
  } catch {
    // Ignore draft persistence failures so planner UX still works.
  }
}

export default function MealPlansScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [dashboardByDate, setDashboardByDate] = useState<Record<string, DashboardResponse>>({});
  const [plansByDate, setPlansByDate] = useState<Record<string, MealPlan>>({});
  const [catalogMeals, setCatalogMeals] = useState<PlannerCatalogMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [dayFoodStyles, setDayFoodStyles] = useState<Record<string, DayFoodStyle>>({});
  const [mealSelections, setMealSelections] = useState<Record<string, number>>({});
  const [loggingMealKey, setLoggingMealKey] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [plannerTab, setPlannerTab] = useState<"planner" | "groceries">("planner");
  const [checkedGroceries, setCheckedGroceries] = useState<Record<string, boolean>>({});
  const [mealDeckIndex, setMealDeckIndex] = useState(0);
  const [approvedMeals, setApprovedMeals] = useState<Record<string, boolean>>({});
  const swipePosition = useRef(new Animated.ValueXY()).current;
  const [syncingReminders, setSyncingReminders] = useState(false);

  const weekDays = useMemo(() => buildWeekDays(), []);
  const selectedDayData = weekDays[selectedDay];
  const plannerMealPool = useMemo(() => buildPlannerMealPool(catalogMeals), [catalogMeals]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [profileResult, recordsResult, dashboardResult, plansResult, catalogResult] = await Promise.allSettled([
      getProfile(),
      getMedicalRecords(),
      getDashboard(selectedDayData.dateKey),
      getMealPlans(14),
      getPlannerCatalogMeals()
    ]);

    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value);
    }
    if (recordsResult.status === "fulfilled") {
      setMedicalRecords(recordsResult.value);
    }
    if (dashboardResult.status === "fulfilled") {
      setDashboardByDate((current) => ({
        ...current,
        [selectedDayData.dateKey]: dashboardResult.value
      }));
    }
    if (plansResult.status === "fulfilled") {
      setPlansByDate(
        plansResult.value.reduce<Record<string, MealPlan>>((accumulator, plan) => {
          accumulator[plan.planDate] = plan;
          return accumulator;
        }, {})
      );
    }
    if (catalogResult.status === "fulfilled") {
      setCatalogMeals(catalogResult.value);
    }

    const failures = [profileResult, recordsResult, dashboardResult, plansResult, catalogResult].filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    const onlyConnectionFailures = failures.length > 0 && failures.every((result) => isConnectionishError(result.reason));
    const hasUsableLiveData =
      profileResult.status === "fulfilled" ||
      recordsResult.status === "fulfilled" ||
      dashboardResult.status === "fulfilled" ||
      plansResult.status === "fulfilled" ||
      catalogResult.status === "fulfilled";

    if (failures.length === 0) {
      setError(null);
      setConnectionNotice(null);
    } else if (onlyConnectionFailures && !hasUsableLiveData) {
      setError(null);
      setConnectionNotice("Using a local planning preview while the live backend reconnects.");
    } else {
      setError(null);
      setConnectionNotice(null);
    }

    setLoading(false);
  }, [selectedDayData.dateKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (!profile) {
      return;
    }
    let cancelled = false;
    loadPlannerDraft(profile).then((draft) => {
      if (cancelled || !draft) {
        return;
      }
      setMealSelections(draft.mealSelections || {});
      setApprovedMeals(draft.approvedMeals || {});
      setDayFoodStyles((current) => ({ ...current, ...(draft.dayFoodStyles || {}) }));
    });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    savePlannerDraft(profile, {
      mealSelections,
      approvedMeals,
      dayFoodStyles
    }).catch(() => {
      // Ignore draft persistence failures during local development.
    });
  }, [approvedMeals, dayFoodStyles, mealSelections, profile]);

  const handleGeneratePlan = useCallback(async () => {
    if (!selectedDayData) {
      return;
    }

    try {
      setGeneratingPlan(true);
      const generatedPlan = await generateMealPlan({
        planDate: selectedDayData.dateKey,
        userPrompt: buildPlanPrompt(dayFoodStyles[selectedDayData.dateKey] || "profile", profile)
      });
      setPlansByDate((current) => ({
        ...current,
        [generatedPlan.planDate]: generatedPlan
      }));
      setMealSelections((current) => {
        const next = { ...current };
        for (const meal of generatedPlan.meals) {
          delete next[`${generatedPlan.planDate}:${meal.mealType}`];
        }
        return next;
      });
      setSaveMessage("Meal plan refreshed from the unified recommendation engine.");
      setError(null);
      setConnectionNotice(null);
    } catch (requestError) {
      if (isConnectionishError(requestError)) {
        setError(null);
        if (!plansByDate[selectedDayData.dateKey] && !catalogMeals.length) {
          setConnectionNotice("Using a local planning preview while the live backend reconnects.");
        }
      } else {
        setError((requestError as Error).message);
      }
    } finally {
      setGeneratingPlan(false);
    }
  }, [catalogMeals.length, dayFoodStyles, plansByDate, profile, selectedDayData]);

  useEffect(() => {
    if (!loading && selectedDayData && !plansByDate[selectedDayData.dateKey] && !generatingPlan) {
      handleGeneratePlan();
    }
  }, [generatingPlan, handleGeneratePlan, loading, plansByDate, selectedDayData]);

  const trackPlannerFeedback = useCallback(
    (action: "accepted" | "passed" | "logged", meal: PlanMeal | PlanMealChoice | null, mealType?: MealType) => {
      if (!meal) {
        return;
      }
      submitPlannerFeedback({
        action,
        title: meal.title,
        description: meal.description,
        mealType: mealType || ("mealType" in meal && meal.mealType ? meal.mealType : "snack"),
        source: meal.source || "planner",
        sourceMealId: "foodId" in meal ? meal.foodId || "" : "",
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        servingSuggestion: meal.servingSuggestion,
        tags: meal.tags || [],
        cuisineTags: meal.cuisineTags || [],
        nutritionConfidence: meal.nutritionConfidence || "medium",
        recipe: meal.recipe || null
      }).catch(() => {
        // Silent by design so planner UX isn't blocked by analytics-style feedback failures.
      });
    },
    []
  );

  const handleQuickLogMeal = useCallback(
    async (meal: PlanMeal & { foodId?: string }) => {
      const mealKey = `${selectedDayData.dateKey}:${meal.mealType}:${meal.title}`;
      setLoggingMealKey(mealKey);
      try {
        await createMealLog({
          fdcId: meal.foodId || "",
          mealType: meal.mealType,
          quantity: 1,
          portionUnit: "serving"
        });

        setSaveMessage(`${meal.title} added to your food log.`);
        setError(null);
        const dashboardResponse = await getDashboard(selectedDayData.dateKey);
        setDashboardByDate((current) => ({
          ...current,
          [selectedDayData.dateKey]: dashboardResponse
        }));
        setApprovedMeals((current) => ({
          ...current,
          [`${selectedDayData.dateKey}:${meal.mealType}`]: true
        }));
        setMealDeckIndex((current) => current + 1);
        trackPlannerFeedback("logged", meal, meal.mealType);
      } catch (requestError) {
        setError((requestError as Error).message);
      } finally {
        setLoggingMealKey(null);
      }
    },
    [selectedDayData.dateKey, trackPlannerFeedback]
  );

  const selectedPlan = useMemo(() => {
    const savedPlan = plansByDate[selectedDayData.dateKey];
    if (!savedPlan) {
      return null;
    }
    const selectedIndexes = savedPlan.meals.reduce<Record<string, number>>((accumulator, meal) => {
      accumulator[meal.mealType] = mealSelections[`${selectedDayData.dateKey}:${meal.mealType}`] ?? 0;
      return accumulator;
    }, {});
    return mapSavedPlanToUi(savedPlan, selectedIndexes);
  }, [mealSelections, plansByDate, selectedDayData.dateKey]);

  const recentPlannerTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const [dateKey, plan] of Object.entries(plansByDate)) {
      if (dateKey === selectedDayData.dateKey) {
        continue;
      }
      for (const meal of plan.meals || []) {
        const approved = approvedMeals[`${dateKey}:${meal.mealType}`];
        if (approved || Object.keys(approvedMeals).length === 0) {
          titles.add(normalizeMealIdentity(meal.title));
          for (const alternative of meal.alternatives || []) {
            if (alternative?.title) {
              titles.add(normalizeMealIdentity(alternative.title));
            }
          }
        }
      }
    }
    return titles;
  }, [approvedMeals, plansByDate, selectedDayData.dateKey]);

  const baseResolvedPlan = useMemo(() => {
    if (selectedPlan) {
      return selectedPlan;
    }

    return buildAutoPlan(
      selectedDayData.dateKey,
      profile,
      medicalRecords,
      dayFoodStyles[selectedDayData.dateKey] || "profile",
      0,
      dashboardByDate[selectedDayData.dateKey] || null,
      plannerMealPool,
      recentPlannerTitles
    );
  }, [dashboardByDate, dayFoodStyles, medicalRecords, plannerMealPool, profile, recentPlannerTitles, selectedDayData.dateKey, selectedPlan]);

  const resolvedPlan = useMemo(
    () => applyMealSelectionsToPlan(baseResolvedPlan, selectedDayData.dateKey, mealSelections),
    [baseResolvedPlan, mealSelections, selectedDayData.dateKey]
  );

  useEffect(() => {
    setMealDeckIndex(0);
  }, [selectedDayData.dateKey, plannerTab]);

  useEffect(() => {
    if (!resolvedPlan?.meals?.length) {
      setMealDeckIndex(0);
      return;
    }
    if (mealDeckIndex > resolvedPlan.meals.length - 1) {
      setMealDeckIndex(0);
    }
  }, [mealDeckIndex, resolvedPlan]);

  useEffect(() => {
    swipePosition.setValue({ x: 0, y: 0 });
  }, [mealDeckIndex, plannerTab, selectedDayData.dateKey, swipePosition]);

  const groceryPreview = useMemo(() => {
    if (!resolvedPlan) {
      return [];
    }
    const approvedForDay = resolvedPlan.meals.filter((meal) => approvedMeals[`${selectedDayData.dateKey}:${meal.mealType}`]);
    const sourceMeals = approvedForDay.length > 0 ? approvedForDay : resolvedPlan.meals;
    return sourceMeals.map((meal) => ({
      key: meal.mealType,
      title: meal.title,
      subtitle: `${meal.mealType} · ${meal.servingSuggestion}`
    }));
  }, [approvedMeals, resolvedPlan, selectedDayData.dateKey]);

  const shoppingGroups = useMemo(() => {
    if (!resolvedPlan) {
      return [];
    }
    const approvedForDay = resolvedPlan.meals.filter((meal) => approvedMeals[`${selectedDayData.dateKey}:${meal.mealType}`]);
    const sourceMeals = approvedForDay.length > 0 ? approvedForDay : resolvedPlan.meals;
    return buildShoppingList(sourceMeals as Array<PlanMeal & { foodId?: string }>);
  }, [approvedMeals, resolvedPlan, selectedDayData.dateKey]);

  const checkedCount = useMemo(
    () => Object.values(checkedGroceries).filter(Boolean).length,
    [checkedGroceries]
  );

  const totalGroceryCount = useMemo(
    () => shoppingGroups.reduce((sum, group) => sum + group.items.length, 0),
    [shoppingGroups]
  );

  const currentDeckMeal = resolvedPlan?.meals?.[mealDeckIndex] || null;
  const currentMealArt = useMemo(
    () => (currentDeckMeal ? getMealArtwork(currentDeckMeal) : null),
    [currentDeckMeal]
  );
  const approvedCount = useMemo(() => {
    if (!resolvedPlan) {
      return 0;
    }
    return resolvedPlan.meals.filter((meal) => approvedMeals[`${selectedDayData.dateKey}:${meal.mealType}`]).length;
  }, [approvedMeals, resolvedPlan, selectedDayData.dateKey]);

  const weeklyAcceptedSummary = useMemo(() => {
    return weekDays.map((day) => {
      const plan = plansByDate[day.dateKey];
      const count = plan
        ? plan.meals.filter((meal) => approvedMeals[`${day.dateKey}:${meal.mealType}`]).length
        : 0;
      return { dateKey: day.dateKey, count };
    });
  }, [approvedMeals, plansByDate, weekDays]);

  const hasWeeklyAcceptedSummary = useMemo(
    () => weeklyAcceptedSummary.some((item) => item.count > 0),
    [weeklyAcceptedSummary]
  );

  const handleResyncReminders = useCallback(async () => {
    if (!profile) {
      return;
    }
    try {
      setSyncingReminders(true);
      const result = await syncMealReminderSchedule(profile);
      setSaveMessage(
        profile.wantsMealReminders
          ? `Meal reminders synced for ${result.scheduledCount} time${result.scheduledCount === 1 ? "" : "s"}.`
          : "Meal reminders are off, so any scheduled reminders were cleared."
      );
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSyncingReminders(false);
    }
  }, [profile]);

  const reminderMoments = useMemo(() => {
    if (!profile?.mealTimes) {
      return [];
    }
    return [
      profile.mealTimes.breakfast ? `Breakfast ${profile.mealTimes.breakfast}` : null,
      profile.mealTimes.lunch ? `Lunch ${profile.mealTimes.lunch}` : null,
      profile.mealTimes.dinner ? `Dinner ${profile.mealTimes.dinner}` : null,
      profile.mealTimes.snack && (profile.mealsPerDay || 0) >= 4 ? `Snack ${profile.mealTimes.snack}` : null
    ].filter(Boolean) as string[];
  }, [profile]);

  const handlePassMeal = useCallback(() => {
    if (!currentDeckMeal || !resolvedPlan) {
      return;
    }
    trackPlannerFeedback("passed", currentDeckMeal, currentDeckMeal.mealType);
    const mealKey = `${selectedDayData.dateKey}:${currentDeckMeal.mealType}`;
    setMealSelections((current) => {
      const nextIndex = ((current[mealKey] ?? 0) + 1) % currentDeckMeal.options.length;
      return {
        ...current,
        [mealKey]: nextIndex
      };
    });
    setApprovedMeals((current) => ({
      ...current,
      [mealKey]: false
    }));
    if (currentDeckMeal.options.length <= 1) {
      setMealDeckIndex((current) => Math.min(current + 1, resolvedPlan.meals.length - 1));
    }
  }, [currentDeckMeal, resolvedPlan, selectedDayData.dateKey, trackPlannerFeedback]);

  const handleAcceptMeal = useCallback(() => {
    if (!currentDeckMeal || !resolvedPlan) {
      return;
    }
    trackPlannerFeedback("accepted", currentDeckMeal, currentDeckMeal.mealType);
    const mealKey = `${selectedDayData.dateKey}:${currentDeckMeal.mealType}`;
    setApprovedMeals((current) => ({
      ...current,
      [mealKey]: true
    }));
    setMealDeckIndex((current) => Math.min(current + 1, resolvedPlan.meals.length - 1));
  }, [currentDeckMeal, resolvedPlan, selectedDayData.dateKey, trackPlannerFeedback]);

  const animateSwipe = useCallback(
    (direction: "left" | "right") => {
      Animated.timing(swipePosition, {
        toValue: { x: direction === "left" ? -360 : 360, y: 0 },
        duration: 180,
        useNativeDriver: false
      }).start(() => {
        swipePosition.setValue({ x: 0, y: 0 });
        if (direction === "left") {
          handlePassMeal();
        } else {
          handleAcceptMeal();
        }
      });
    },
    [handleAcceptMeal, handlePassMeal, swipePosition]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          swipePosition.setValue({ x: gesture.dx, y: 0 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 110) {
            animateSwipe("right");
            return;
          }
          if (gesture.dx < -110) {
            animateSwipe("left");
            return;
          }
          Animated.spring(swipePosition, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false
          }).start();
        }
      }),
    [animateSwipe, swipePosition]
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#F7FBFF", "#EEF6FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plannerHero}>
          <View style={styles.headerTopRow}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.title}>Plan my week</Text>
              <Text style={styles.heroEyebrow}>Swipe meals, keep favorites, and turn them into groceries.</Text>
            </View>
            <Pressable style={styles.heroIconButton}>
              <Ionicons name="settings-outline" size={20} color={palette.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.plannerTabs}>
            <Pressable onPress={() => setPlannerTab("planner")} style={[styles.plannerTab, plannerTab === "planner" && styles.plannerTabActive]}>
              <Text style={[styles.plannerTabText, plannerTab === "planner" && styles.plannerTabTextActive]}>Meal Planner</Text>
            </Pressable>
            <Pressable onPress={() => setPlannerTab("groceries")} style={[styles.plannerTab, plannerTab === "groceries" && styles.plannerTabActive]}>
              <Text style={[styles.plannerTabText, plannerTab === "groceries" && styles.plannerTabTextActive]}>Groceries</Text>
            </Pressable>
          </View>
          <View style={styles.actionGrid}>
            {[
              { label: "Create", icon: "add" as const, onPress: handleGeneratePlan },
              { label: "Edit", icon: "create-outline" as const, onPress: () => setPlannerTab("planner") },
              { label: "More", icon: "ellipsis-horizontal" as const, onPress: () => setPlannerTab("groceries") }
            ].map((action) => (
              <Pressable key={action.label} onPress={action.onPress} style={styles.actionCard}>
                <Ionicons name={action.icon} size={22} color={palette.primary} />
                <Text style={styles.actionCardText}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatValue}>{approvedCount}</Text>
              <Text style={styles.heroStatLabel}>accepted</Text>
            </View>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatValue}>{resolvedPlan?.meals.length || 0}</Text>
              <Text style={styles.heroStatLabel}>today slots</Text>
            </View>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatValue}>{totalGroceryCount}</Text>
              <Text style={styles.heroStatLabel}>shopping items</Text>
            </View>
          </View>
        </LinearGradient>

        {loading ? <LoadingCard label="Building your plan from profile, goals, and available health context..." /> : null}
        {error && !connectionNotice ? <ErrorCard message={error} /> : null}
        {connectionNotice ? (
          <View style={styles.bannerWarn}>
            <Text style={styles.bannerWarnTitle}>Local preview mode</Text>
            <Text style={styles.bannerCopy}>{connectionNotice}</Text>
          </View>
        ) : null}
        {saveMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>{saveMessage}</Text>
          </View>
        ) : null}

          <View style={styles.planMetaCard}>
            <View style={styles.planMetaRow}>
              <View style={styles.planMetaCopy}>
                <Text style={styles.planDate}>{formatLongDate(selectedDayData.dateKey)}</Text>
                <Text style={styles.planDateSub}>
                {resolvedPlan ? `${resolvedPlan.totals.calories} cal planned` : "Generating a plan for this day"}
              </Text>
            </View>
            <View style={[styles.statusBadge, medicalRecords.length > 0 ? styles.statusBadgeInfo : styles.statusBadgeWarm]}>
              <Text style={[styles.statusBadgeText, medicalRecords.length > 0 ? styles.statusBadgeTextInfo : styles.statusBadgeTextWarm]}>
                {medicalRecords.length > 0 ? "Using medical records" : "Using your profile"}
              </Text>
            </View>
            </View>
            {hasWeeklyAcceptedSummary ? (
              <View style={styles.weekAcceptedRow}>
                {weekDays.map((day) => {
                  const summary = weeklyAcceptedSummary.find((item) => item.dateKey === day.dateKey);
                  const selected = day.dateKey === selectedDayData.dateKey;
                  return (
                    <View key={`accepted-${day.dateKey}`} style={[styles.weekAcceptedChip, selected && styles.weekAcceptedChipActive]}>
                      <Text style={[styles.weekAcceptedDay, selected && styles.weekAcceptedDayActive]}>{day.dayName}</Text>
                      <Text style={[styles.weekAcceptedValue, selected && styles.weekAcceptedValueActive]}>
                        {summary?.count || 0}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayScroller}>
              {weekDays.map((day, index) => {
              const selected = index === selectedDay;
              const isToday = day.dateKey === getTodayDateKey();
              return (
                <Pressable
                  key={day.dateKey}
                  onPress={() => setSelectedDay(index)}
                  style={[styles.dayChip, selected && styles.dayChipActive]}
                >
                  {isToday ? (
                    <View style={[styles.dayPill, selected && styles.dayPillActive]}>
                      <Text style={[styles.dayPillText, selected && styles.dayPillTextActive]}>Today</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.dayName, selected && styles.dayTextActive]}>{day.dayName}</Text>
                  <Text style={[styles.dayNumber, selected && styles.dayTextActive]}>{day.dayNum}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.preferenceChipRow}>
            {(["profile", "veg", "egg", "non_veg"] as DayFoodStyle[]).map((option) => {
              const selected = (dayFoodStyles[selectedDayData.dateKey] || "profile") === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setDayFoodStyles((current) => ({
                      ...current,
                      [selectedDayData.dateKey]: option
                    }));
                  }}
                  style={[styles.preferenceChip, selected && styles.preferenceChipActive]}
                >
                  <Text style={[styles.preferenceChipText, selected && styles.preferenceChipTextActive]}>
                    {dayFoodStyleLabels[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {plannerTab === "groceries" ? (
          <>
            <View style={styles.groceryHeaderCard}>
              <View style={styles.groceryHeaderTop}>
                <View>
                  <Text style={styles.groceryTitle}>Your shopping list</Text>
                  <Text style={styles.grocerySubtitle}>
                    Built from the meals currently selected for this day, so your plan and groceries stay in sync.
                  </Text>
                </View>
                <View style={styles.groceryCountBadge}>
                  <Text style={styles.groceryCountText}>
                    {checkedCount}/{totalGroceryCount}
                  </Text>
                </View>
              </View>
              <View style={styles.groceryMiniSummaryRow}>
                <View style={styles.groceryMiniSummary}>
                  <Text style={styles.groceryMiniValue}>{shoppingGroups.length}</Text>
                  <Text style={styles.groceryMiniLabel}>groups</Text>
                </View>
                <View style={styles.groceryMiniSummary}>
                  <Text style={styles.groceryMiniValue}>{totalGroceryCount}</Text>
                  <Text style={styles.groceryMiniLabel}>items</Text>
                </View>
                <View style={styles.groceryMiniSummary}>
                  <Text style={styles.groceryMiniValue}>{checkedCount}</Text>
                  <Text style={styles.groceryMiniLabel}>picked</Text>
                </View>
              </View>
              {groceryPreview.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mealPreviewScroller}>
                  {groceryPreview.map((item) => (
                    <View key={item.key} style={styles.mealPreviewCard}>
                      <Text style={styles.mealPreviewTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.mealPreviewMeta}>{item.subtitle}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {shoppingGroups.length > 0 ? (
              <>
                <LinearGradient colors={["#FFD07A", "#E86A23"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.groceryHero}>
                  <View style={styles.groceryHeroIcon}>
                    <Ionicons name="rocket-outline" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.groceryHeroCopy}>
                    <Text style={styles.groceryHeroTitle}>Save time at the supermarket</Text>
                    <Text style={styles.groceryHeroText}>
                      Your ingredients are grouped by aisle so shopping feels closer to a ready-to-use weekly list.
                    </Text>
                  </View>
                </LinearGradient>

                <View style={styles.groceryGroups}>
                  {shoppingGroups.map((group) => (
                    <View key={group.category} style={styles.grocerySectionCard}>
                      <View style={styles.grocerySectionHeader}>
                        <Text style={styles.grocerySectionTitle}>{group.category}</Text>
                        <Text style={styles.grocerySectionCount}>{group.items.length}</Text>
                      </View>
                      <View style={styles.groceryChecklist}>
                        {group.items.map((item) => {
                          const checked = Boolean(checkedGroceries[item.key]);
                          return (
                            <Pressable
                              key={item.key}
                              onPress={() =>
                                setCheckedGroceries((current) => ({
                                  ...current,
                                  [item.key]: !current[item.key]
                                }))
                              }
                              style={[styles.groceryChecklistItem, checked && styles.groceryChecklistItemChecked]}
                            >
                              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                                {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                              </View>
                              <View style={styles.groceryChecklistCopy}>
                                <Text style={[styles.groceryChecklistTitle, checked && styles.groceryChecklistTitleChecked]}>
                                  {item.label}
                                </Text>
                                <Text style={styles.groceryChecklistMeta}>
                                  {item.meals.length === 1 ? item.meals[0] : `${item.meals.length} meals`}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <EmptyCard
                title="No meals queued yet"
                detail="Generate a plan first, then this tab can build a grocery list from the recipe ingredients attached to those meals."
              />
            )}
          </>
        ) : resolvedPlan ? (
          <>
            <LinearGradient colors={["#FFF8EE", "#FFF3E0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <View style={styles.reminderIconWrap}>
                  <Ionicons name="notifications-outline" size={20} color="#E58B16" />
                </View>
                <View style={styles.reminderCopy}>
                  <Text style={styles.reminderTitle}>
                    {profile?.wantsMealReminders ? "Reminder rhythm ready" : "Meal timing saved"}
                  </Text>
                  <Text style={styles.reminderText}>
                    {profile?.wantsMealReminders
                      ? "Your planner is already using the meal timing you set during onboarding."
                      : "Your meal times are saved and shaping the plan, even though reminders are off right now."}
                  </Text>
                </View>
              </View>
              {reminderMoments.length > 0 ? (
                <View style={styles.reminderChipRow}>
                  {reminderMoments.map((item) => (
                    <View key={item} style={styles.reminderChip}>
                      <Text style={styles.reminderChipText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Pressable onPress={() => router.push("/onboarding?mode=edit")} style={styles.reminderAction}>
                <Text style={styles.reminderActionText}>Edit meal times</Text>
              </Pressable>
              <Pressable onPress={handleResyncReminders} style={styles.reminderSecondaryAction} disabled={syncingReminders}>
                <Text style={styles.reminderSecondaryActionText}>{syncingReminders ? "Syncing..." : "Sync reminders"}</Text>
              </Pressable>
            </LinearGradient>

            <View style={styles.swipePlannerCard}>
              <View style={styles.swipePlannerHeader}>
                <View style={styles.swipePlannerHeaderLeft}>
                  <Pressable
                    onPress={() => setMealDeckIndex((current) => Math.max(0, current - 1))}
                    style={styles.deckNavButton}
                    disabled={mealDeckIndex === 0}
                  >
                    <Ionicons name="close-outline" size={20} color={mealDeckIndex === 0 ? "#CBD5E1" : palette.textMuted} />
                  </Pressable>
                  <View>
                    <Text style={styles.swipePlannerTitle}>Swipe your meals</Text>
                    <Text style={styles.swipePlannerSubtitle}>Keep what fits today. Pass when you want a better option.</Text>
                  </View>
                </View>
                <View style={styles.deckCountBadge}>
                  <Text style={styles.deckCountText}>
                    {approvedCount}/{resolvedPlan.meals.length}
                  </Text>
                </View>
              </View>

              <View style={styles.deckProgressRow}>
                {resolvedPlan.meals.map((meal, index) => {
                  const approved = approvedMeals[`${selectedDayData.dateKey}:${meal.mealType}`];
                  const active = index === mealDeckIndex;
                  return (
                    <View
                      key={`progress-${meal.mealType}`}
                      style={[
                        styles.deckProgressBar,
                        approved && styles.deckProgressBarApproved,
                        active && styles.deckProgressBarActive
                      ]}
                    />
                  );
                })}
              </View>
              <Text style={styles.deckMealHint}>Swipe right to keep a meal. Swipe left to rotate it out.</Text>

              {currentDeckMeal ? (
                <>
                  <Animated.View
                    style={[
                      styles.deckMealCard,
                      {
                        transform: [
                          { translateX: swipePosition.x },
                          {
                            rotate: swipePosition.x.interpolate({
                              inputRange: [-220, 0, 220],
                              outputRange: ["-10deg", "0deg", "10deg"]
                            })
                          }
                        ]
                      }
                    ]}
                    {...panResponder.panHandlers}
                  >
                    <LinearGradient colors={currentMealArt?.colors || mealVisuals[currentDeckMeal.mealType].colors} style={styles.deckMealVisual}>
                      <View style={styles.deckVisualTop}>
                        <Text style={styles.deckMealType}>{currentDeckMeal.mealType}</Text>
                        <View style={styles.deckSwipeHint}>
                          <Text style={styles.deckSwipeHintText}>Swipe to choose</Text>
                        </View>
                      </View>
                      <View style={styles.deckArtworkWrap}>
                        <Text style={styles.deckArtworkEmoji}>{currentMealArt?.emoji || "🍽️"}</Text>
                        <View style={styles.deckAccentRow}>
                          {(currentMealArt?.accents || []).map((accent) => (
                            <View key={`${currentDeckMeal.title}-${accent}`} style={styles.deckAccentBubble}>
                              <Text style={styles.deckAccentText}>{accent}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </LinearGradient>
                    <View style={styles.deckMealBody}>
                      <Text style={styles.deckMealTitle}>{currentDeckMeal.title}</Text>
                      <Text style={styles.deckMealDescription}>{currentDeckMeal.description}</Text>
                      <View style={styles.deckTagRow}>
                        <Text style={styles.deckTag}>{currentDeckMeal.calories} cal</Text>
                        <Text style={styles.deckTag}>{currentDeckMeal.servingSuggestion}</Text>
                        <Text style={styles.deckTag}>P {currentDeckMeal.protein}g</Text>
                      </View>
                      {currentDeckMeal.recipe?.ingredients?.length ? (
                        <View style={styles.deckIngredientRow}>
                          {currentDeckMeal.recipe.ingredients.slice(0, 3).map((ingredient) => (
                            <Text key={`${currentDeckMeal.title}-${ingredient}`} style={styles.deckIngredientChip} numberOfLines={1}>
                              {ingredient}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                      <Text style={styles.deckMealWhy}>{currentDeckMeal.whyItFits}</Text>
                    </View>
                  </Animated.View>

                  <View style={styles.deckActions}>
                    <Pressable onPress={() => animateSwipe("left")} style={styles.passButton}>
                      <Ionicons name="close" size={28} color="#EF4444" />
                    </Pressable>
                    <Pressable onPress={() => animateSwipe("right")} style={styles.acceptButton}>
                      <Ionicons name="heart" size={28} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>

            <View style={styles.profileContext}>
              <Text style={styles.profileContextTitle}>Preference fit</Text>
              <View style={styles.profileChipWrap}>
                {profile?.likedFoods?.length ? (
                  <View style={styles.profileChip}>
                    <Text style={styles.profileChipLabel}>Likes</Text>
                    <Text style={styles.profileChipText}>{profile.likedFoods.slice(0, 6).join(", ")}</Text>
                  </View>
                ) : null}
                {profile?.dislikedFoods?.length ? (
                  <View style={styles.profileChip}>
                    <Text style={styles.profileChipLabel}>Avoid</Text>
                    <Text style={styles.profileChipText}>{profile.dislikedFoods.slice(0, 6).join(", ")}</Text>
                  </View>
                ) : null}
                {profile?.mealsPerDay ? (
                  <View style={styles.profileChip}>
                    <Text style={styles.profileChipLabel}>Rhythm</Text>
                    <Text style={styles.profileChipText}>{profile.mealsPerDay} eating occasions planned into the day.</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.planSummaryStrip}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{resolvedPlan.totals.calories}</Text>
                <Text style={styles.summaryStatLabel}>calories</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{resolvedPlan.totals.protein}g</Text>
                <Text style={styles.summaryStatLabel}>protein</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{resolvedPlan.totals.carbs}g</Text>
                <Text style={styles.summaryStatLabel}>carbs</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{resolvedPlan.totals.fat}g</Text>
                <Text style={styles.summaryStatLabel}>fat</Text>
              </View>
            </View>

            <View style={styles.planNotesCard}>
              <Text style={styles.planNotesTitle}>Today’s plan</Text>
              <Text style={styles.planNotesText}>{resolvedPlan.notes}</Text>
              <Pressable onPress={handleGeneratePlan} style={styles.secondaryActionButton} disabled={generatingPlan}>
                <Text style={styles.secondaryActionText}>{generatingPlan ? "Refreshing..." : "Create a different version"}</Text>
              </Pressable>
            </View>

            <View style={styles.plannerGrid}>
              {resolvedPlan.meals.map((meal) => (
                <View key={`${selectedDayData.dateKey}-${meal.mealType}`} style={styles.mealCard}>
                  <LinearGradient colors={mealVisuals[meal.mealType].colors} style={styles.mealImageCard}>
                    <View style={[styles.mealBadge, { backgroundColor: "rgba(255,255,255,0.82)" }]}>
                      <Ionicons name={mealVisuals[meal.mealType].icon} size={22} color={mealBadge[meal.mealType].text} />
                    </View>
                    <Text style={styles.imageMealType}>{meal.mealType}</Text>
                  </LinearGradient>
                  <View style={styles.mealBody}>
                    <Text style={styles.mealTitle}>{meal.title}</Text>
                    <Text style={styles.mealDescription}>{meal.description}</Text>
                    <View style={styles.inlineMealMeta}>
                      <Text style={styles.mealCaloriesInline}>{meal.calories} cal</Text>
                      <Text style={styles.inlineDivider}>•</Text>
                      <Text style={styles.mealServingInline}>{meal.servingSuggestion}</Text>
                    </View>
                  </View>
                  <View style={styles.macroRow}>
                    <Text style={styles.macroChip}>P {meal.protein}g</Text>
                    <Text style={styles.macroChip}>C {meal.carbs}g</Text>
                    <Text style={styles.macroChip}>F {meal.fat}g</Text>
                  </View>
                  <Text style={styles.whyFitsText}>{meal.whyItFits}</Text>
                  {meal.options.length > 1 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swapScroller}>
                      {meal.options.map((option, index) => {
                        const mealKey = `${selectedDayData.dateKey}:${meal.mealType}`;
                        const selectedOption = (mealSelections[mealKey] ?? 0) === index;
                        return (
                          <Pressable
                            key={`${meal.mealType}-${option.title}`}
                            onPress={() =>
                              setMealSelections((current) => ({
                                ...current,
                                [mealKey]: index
                              }))
                            }
                            style={[styles.swapChip, selectedOption && styles.swapChipActive]}
                          >
                            <Text style={[styles.swapChipTitle, selectedOption && styles.swapChipTitleActive]}>
                              {index === 0 ? "Current" : `Option ${index + 1}`}
                            </Text>
                            <Text style={[styles.swapChipMeta, selectedOption && styles.swapChipMetaActive]} numberOfLines={1}>
                              {option.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : null}
                  <View style={styles.mealFooter}>
                    <Text style={styles.mealFooterLabel}>{meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}</Text>
                    <Pressable
                      onPress={() => handleQuickLogMeal(meal)}
                      style={styles.quickLogButton}
                      disabled={loggingMealKey === `${selectedDayData.dateKey}:${meal.mealType}:${meal.title}`}
                    >
                      <Text style={styles.quickLogButtonText}>
                        {loggingMealKey === `${selectedDayData.dateKey}:${meal.mealType}:${meal.title}` ? "Adding..." : "Log"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <EmptyCard title="No plan available yet" detail="Generate a plan to start filling this day with breakfast, lunch, snack, and dinner cards." />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 3
  },
  plannerHero: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#FAD7A0",
    padding: spacing.lg,
    gap: spacing.md
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  heroTitleBlock: {
    flex: 1,
    gap: 4
  },
  heroIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FDE3BB"
  },
  plannerTabs: {
    flexDirection: "row",
    gap: spacing.md
  },
  plannerTab: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  plannerTabActive: {
    borderBottomColor: "#F59E0B"
  },
  plannerTabText: {
    color: palette.textMuted,
    fontSize: typography.body,
    fontWeight: "600"
  },
  plannerTabTextActive: {
    color: "#B45309",
    fontWeight: "800"
  },
  actionGrid: {
    flexDirection: "row",
    gap: spacing.md
  },
  heroStatsRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  heroStatPill: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#FDE3BB",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 2
  },
  heroStatValue: {
    color: "#B45309",
    fontSize: typography.h3,
    fontWeight: "800"
  },
  heroStatLabel: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  actionCard: {
    flex: 1,
    borderRadius: radii.xl,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FDE3BB",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    gap: spacing.sm
  },
  actionCardText: {
    color: "#D97706",
    fontSize: typography.body,
    fontWeight: "800"
  },
  header: {
    gap: spacing.sm
  },
  title: {
    color: palette.textPrimary,
    fontSize: 34,
    fontWeight: "800"
  },
  heroEyebrow: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 24
  },
  bannerInfo: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.xs
  },
  bannerWarn: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.xs
  },
  bannerTitle: {
    color: palette.primary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  bannerWarnTitle: {
    color: palette.warning,
    fontSize: typography.label,
    fontWeight: "700"
  },
  bannerCopy: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  successBanner: {
    backgroundColor: "#ECFDF3",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: radii.xl,
    padding: spacing.md
  },
  successBannerText: {
    color: palette.success,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 22
  },
  planMetaCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  planMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  planMetaCopy: {
    flex: 1,
    gap: 4
  },
  planDate: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: "800"
  },
  planDateSub: {
    color: palette.textMuted,
    fontSize: typography.body
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1
  },
  statusBadgeInfo: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE"
  },
  statusBadgeWarm: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74"
  },
  statusBadgeText: {
    fontSize: typography.caption,
    fontWeight: "800"
  },
  statusBadgeTextInfo: {
    color: palette.primary
  },
  statusBadgeTextWarm: {
    color: "#C46B14"
  },
  reminderCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "#FAD7A0",
    padding: spacing.lg,
    gap: spacing.md
  },
  reminderHeader: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start"
  },
  reminderIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.86)",
    alignItems: "center",
    justifyContent: "center"
  },
  reminderCopy: {
    flex: 1,
    gap: 4
  },
  reminderTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  reminderText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  reminderChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  reminderChip: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "#FDE3BB",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  reminderChipText: {
    color: "#B45309",
    fontSize: typography.caption,
    fontWeight: "700"
  },
  reminderAction: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FDE3BB",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  reminderActionText: {
    color: "#D97706",
    fontSize: typography.caption,
    fontWeight: "800"
  },
  reminderSecondaryAction: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FAD7A0",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  reminderSecondaryActionText: {
    color: "#B45309",
    fontSize: typography.caption,
    fontWeight: "800"
  },
  preferenceCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm
  },
  preferenceTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  preferenceSubtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  preferenceChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  preferenceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  preferenceChipActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#DBEAFE"
  },
  preferenceChipText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  preferenceChipTextActive: {
    color: palette.primary
  },
  regenerateButton: {
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md
  },
  regenerateButtonText: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "800"
  },
  dayScroller: {
    gap: spacing.sm
  },
  weekAcceptedRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  weekAcceptedChip: {
    flex: 1,
    borderRadius: radii.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: 2
  },
  weekAcceptedChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE"
  },
  weekAcceptedDay: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800"
  },
  weekAcceptedDayActive: {
    color: palette.primary
  },
  weekAcceptedValue: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "800"
  },
  weekAcceptedValueActive: {
    color: palette.primary
  },
  dayChip: {
    width: 78,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 4
  },
  dayPill: {
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  dayPillActive: {
    backgroundColor: "rgba(255,255,255,0.2)"
  },
  dayPillText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: "800"
  },
  dayPillTextActive: {
    color: "#FFFFFF"
  },
  dayChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary
  },
  dayName: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  dayNumber: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  dayStatus: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  dayTextActive: {
    color: "#FFFFFF"
  },
  planSummaryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  swipePlannerCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  swipePlannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  swipePlannerHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1
  },
  deckNavButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  swipePlannerTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  swipePlannerSubtitle: {
    color: palette.textMuted,
    fontSize: typography.caption,
    lineHeight: 19
  },
  deckMealHint: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    lineHeight: 19
  },
  deckCountBadge: {
    minWidth: 72,
    borderRadius: 18,
    backgroundColor: "#FFF3E0",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  deckCountText: {
    color: "#E58B16",
    fontSize: typography.h3,
    fontWeight: "800"
  },
  deckProgressRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  deckProgressBar: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E5E7EB"
  },
  deckProgressBarActive: {
    backgroundColor: "#FDBA74"
  },
  deckProgressBarApproved: {
    backgroundColor: "#F59E0B"
  },
  deckMealCard: {
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF"
  },
  deckMealVisual: {
    height: 220,
    padding: spacing.lg,
    justifyContent: "space-between"
  },
  deckVisualTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md
  },
  deckMealType: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "capitalize",
    backgroundColor: "rgba(255,255,255,0.86)",
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  deckSwipeHint: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.86)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  deckSwipeHintText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  deckArtworkWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md
  },
  deckArtworkEmoji: {
    fontSize: 68
  },
  deckAccentRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  deckAccentBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.82)",
    alignItems: "center",
    justifyContent: "center"
  },
  deckAccentText: {
    fontSize: 22
  },
  deckMealBody: {
    padding: spacing.lg,
    gap: spacing.sm
  },
  deckMealTitle: {
    color: palette.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28
  },
  deckMealDescription: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  deckTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  deckTag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  deckMealWhy: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  deckIngredientRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  deckIngredientChip: {
    maxWidth: 140,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  deckActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl
  },
  passButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  acceptButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#FFB347",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FFB347",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  summaryStat: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: radii.xl,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 2
  },
  summaryStatValue: {
    color: palette.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800"
  },
  summaryStatLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  planNotesCard: {
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#DCEAFB",
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  planNotesTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  planNotesText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 23
  },
  secondaryActionButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryActionText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  planSpotlight: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: "#0F172A"
  },
  priorityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  priorityChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.22)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  priorityChipText: {
    color: "#E2E8F0",
    fontSize: typography.caption,
    fontWeight: "700"
  },
  planSpotlightHeader: {
    gap: spacing.md
  },
  planSpotlightCopy: {
    gap: spacing.xs
  },
  planSpotlightEyebrow: {
    color: "#93C5FD",
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  planSpotlightTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30
  },
  planSpotlightText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: typography.body,
    lineHeight: 23
  },
  planSpotlightBadge: {
    width: "100%",
    minWidth: 0,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.26)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  planSpotlightBadgeValue: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800"
  },
  planSpotlightBadgeLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: typography.caption,
    fontWeight: "700",
    textAlign: "center"
  },
  planSpotlightMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  planSpotlightMeta: {
    flexBasis: "31%",
    minWidth: 96,
    borderRadius: radii.lg,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2
  },
  planSpotlightMetaLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: typography.caption,
    fontWeight: "700"
  },
  planSpotlightMetaValue: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  summaryCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  contextCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    gap: spacing.sm
  },
  contextTitle: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  contextPillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  contextPill: {
    width: "100%",
    borderRadius: radii.lg,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2
  },
  contextPillLabel: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  contextPillText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  stack: {
    gap: spacing.md
  },
  mealCard: {
    width: "100%",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    overflow: "hidden",
    gap: spacing.md
  },
  plannerGrid: {
    flexDirection: "column",
    gap: spacing.md
  },
  mealImageCard: {
    height: 154,
    padding: spacing.lg,
    justifyContent: "space-between"
  },
  mealHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  mealTopRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    flex: 1
  },
  mealBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },
  imageMealType: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "capitalize",
    backgroundColor: "rgba(255,255,255,0.82)",
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  mealBody: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm
  },
  mealBadgeText: {
    fontSize: typography.caption,
    fontWeight: "800"
  },
  mealTitleCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  mealTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800",
    flexShrink: 1
  },
  mealMeta: {
    color: palette.textMuted,
    fontSize: typography.caption,
    textTransform: "capitalize"
  },
  inlineMealMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  mealCalories: {
    color: palette.primary,
    fontSize: typography.label,
    fontWeight: "800",
    flexShrink: 0
  },
  mealCaloriesInline: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  inlineDivider: {
    color: palette.textSubtle,
    fontSize: typography.body
  },
  mealServingInline: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  mealDescription: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  mealFitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  mealFitPill: {
    width: "100%",
    borderRadius: radii.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2
  },
  mealFitPillLabel: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  mealFitPillText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  swapWrap: {
    gap: spacing.sm
  },
  swapTitle: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  swapScroller: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  swapChip: {
    minWidth: 150,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 4
  },
  swapChipActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF"
  },
  swapChipTitle: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  swapChipTitleActive: {
    color: palette.primary
  },
  swapChipMeta: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  swapChipMetaActive: {
    color: palette.primary
  },
  macroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  macroChip: {
    color: palette.primary,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  whyFitsText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    lineHeight: 19,
    paddingHorizontal: spacing.lg
  },
  quickLogButton: {
    borderRadius: radii.lg,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  quickLogButtonText: {
    color: "#FFFFFF",
    fontSize: typography.caption,
    fontWeight: "800"
  },
  mealFooter: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  mealFooterLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  groceryCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  groceryTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  groceryHeaderCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  groceryMiniSummaryRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  groceryMiniSummary: {
    flex: 1,
    borderRadius: radii.lg,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: 2
  },
  groceryMiniValue: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  groceryMiniLabel: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  groceryHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  groceryCountBadge: {
    minWidth: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#FFF3E0",
    alignItems: "center",
    justifyContent: "center"
  },
  groceryCountText: {
    color: "#E58B16",
    fontSize: typography.h3,
    fontWeight: "800"
  },
  grocerySubtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  mealPreviewScroller: {
    gap: spacing.md,
    paddingRight: spacing.sm
  },
  mealPreviewCard: {
    width: 188,
    borderRadius: radii.xl,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: spacing.md,
    gap: spacing.xs
  },
  mealPreviewTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 22
  },
  mealPreviewMeta: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  groceryHero: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  groceryHeroIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center"
  },
  groceryHeroCopy: {
    flex: 1,
    gap: spacing.xs
  },
  groceryHeroTitle: {
    color: "#FFFFFF",
    fontSize: typography.h3,
    fontWeight: "800"
  },
  groceryHeroText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: typography.body,
    lineHeight: 22
  },
  groceryGroups: {
    gap: spacing.md
  },
  grocerySectionCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  grocerySectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  grocerySectionTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  grocerySectionCount: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  groceryChecklist: {
    gap: spacing.sm
  },
  groceryChecklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: spacing.md
  },
  groceryChecklistItemChecked: {
    opacity: 0.72
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  checkboxChecked: {
    borderColor: "#6FCF97",
    backgroundColor: "#6FCF97"
  },
  groceryChecklistCopy: {
    flex: 1,
    gap: 2
  },
  groceryChecklistTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  groceryChecklistTitleChecked: {
    textDecorationLine: "line-through",
    color: palette.textMuted
  },
  groceryChecklistMeta: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  groceryList: {
    gap: spacing.md
  },
  groceryListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: spacing.md
  },
  groceryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.primary,
    marginTop: 6
  },
  groceryCopy: {
    flex: 1,
    gap: 2
  },
  groceryItemTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  groceryItemSubtitle: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  profileContext: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.xs
  },
  profileContextTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  profileChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  profileChip: {
    width: "100%",
    borderRadius: radii.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  profileChipLabel: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  profileChipText: {
    color: palette.textPrimary,
    fontSize: typography.body,
    lineHeight: 22
  }
});
