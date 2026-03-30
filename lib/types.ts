export type Meal = {
  name: string;
  time: string;
  note?: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type MacroTarget = {
  label: string;
  value: string;
  detail: string;
};

export type FoodSwap = {
  current: string;
  better: string;
  reason: string;
};

export type WorkoutPlanItem = {
  day: string;
  title: string;
  duration: string;
  description: string;
};

export type WorkoutExercise = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  caloriesBurned: number;
  difficulty: string;
  equipment: string;
  muscleGroups: string[];
  instructions: string[];
};

export type WorkoutLog = {
  id: string;
  userId: string;
  exerciseId: string | null;
  title: string;
  category: string;
  durationMinutes: number;
  caloriesBurned: number | null;
  difficulty: string;
  equipment: string;
  muscleGroups: string[];
  notes: string;
  performedAt: string;
};

export type WorkoutStats = {
  weeklySessions: number;
  weeklyMinutes: number;
  weeklyCalories: number;
  favoriteCategory: string;
  latestWorkout: WorkoutLog | null;
};

export type Trend = {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  note: string;
};

export type ProfileMetric = {
  label: string;
  value: string;
};

export type Profile = {
  id: string;
  publicId?: string;
  email: string;
  name?: string;
  gender: string;
  activityLevel: string;
  weightKg: number;
  targetWeightKg: number;
  heightCm: number;
  dateOfBirth: string;
  age: number | null;
  bmi: number | null;
  dailyCalorieTarget: number;
  healthGoals: string[];
  dietaryPreferences: string[];
  likedFoods: string[];
  dislikedFoods: string[];
  allergies: string[];
  medicalConditions: string[];
  mealsPerDay: number | null;
  mealTimes?: {
    breakfast?: string | null;
    lunch?: string | null;
    dinner?: string | null;
    snack?: string | null;
  };
  wantsMealReminders?: boolean;
  onboardingCompleted: boolean;
  createdDate: string;
  updatedDate: string;
  clinicalMetrics?: {
    latestRecordDate: string | null;
    reportDerivedConditions: string[];
    bloodPressure: { label: string; value: string; observedAt: string | null } | null;
    bloodGlucose: { label: string; value: string; observedAt: string | null } | null;
    heartRate: { label: string; value: string; observedAt: string | null } | null;
    hemoglobin: { label: string; value: string; observedAt: string | null } | null;
  };
};

export type FoodSearchResult = {
  fdcId: string;
  description: string;
  dataType: string;
  source?: string;
  basis?: "per_100g" | "per_serving";
  quantityUnit?: string;
  lastLoggedAt?: string;
  isFavorite?: boolean;
  metadata?: Record<string, string | number | null>;
};

export type Nutrients = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type FoodDetail = FoodSearchResult & {
  nutrientsPer100g: Nutrients;
  metadata?: Record<string, string | number | null>;
};

export type AdminCustomFoodReviewItem = {
  id: string;
  userId: string;
  description: string;
  normalizedName: string;
  usageCount: number;
  promotionStatus: "private" | "review" | "approved" | "rejected";
  reviewNotes: string;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  nutrientsPer100g: Nutrients;
};

export type AdminCustomFoodReviewQueue = {
  threshold: number;
  pendingCount: number;
  foods: AdminCustomFoodReviewItem[];
};

export type AdminCustomFoodReviewMatches = {
  foodId: string;
  normalizedName: string;
  verifiedMatches: FoodSearchResult[];
  duplicateCandidates: Array<{
    id: string;
    description: string;
    normalizedName: string;
    usageCount: number;
    promotionStatus: string;
  }>;
};

export type CatalogSourceRef = {
  kind: string;
  label: string;
  configuredPathEnv?: string;
};

export type CatalogAuditItem = {
  id: string;
  description: string;
  mealType: string | null;
  cuisine: string[];
  tags: string[];
  source: string;
  nutritionTrustLevel: string | null;
  nutritionMethod: string | null;
  sourceBackfillStatus: string | null;
  missingExactSourceRefs: boolean;
  recipeCompositionStatus: string;
  recipeIngredientCount: number;
  sourceRefs: CatalogSourceRef[];
  sourceNote: string;
  catalogVersion: number;
  workflowStatus: string;
  approvedAt: string | null;
  approvedBy: string | null;
};

export type CatalogAuditResponse = {
  totalCount: number;
  missingExactSourceRefsCount: number;
  offset: number;
  limit: number;
  items: CatalogAuditItem[];
};

export type CatalogCompositionIngredient = {
  id: string | null;
  label: string;
  grams: number;
  rawWeightGrams?: number;
  inputWeightGrams?: number;
  resolved: boolean;
  basis?: string | null;
  sourceServingWeightGrams?: number | null;
  foodRef: {
    id?: string;
    fdcId?: string;
    source?: string;
  } | null;
  sourceDescription: string | null;
  sourceType: string | null;
  nutrients: Nutrients;
};

export type CatalogCompositionValidation = {
  errors: string[];
  warnings: string[];
  ingredientInputWeightSum: number;
};

export type CatalogCompositionPreview = {
  catalogId: string;
  baseFood: FoodDetail;
  composedFood: FoodDetail;
  composition: {
    compositionStatus: string;
    recipeType: string;
    totalWeightGrams: number;
    servingWeightGrams: number;
    recipeTotals: Nutrients & { weight_g: number };
    totalMacros: Nutrients;
    composedPer100g: Nutrients | null;
    composedPerServing: Nutrients | null;
    servingsCount: number | null;
    yieldSource: string;
    nutritionConfidence: "high" | "medium" | "low";
    ingredientBreakdown: CatalogCompositionIngredient[];
    validation: CatalogCompositionValidation;
  } | null;
};

export type MedicalLabResult = {
  name: string;
  value: number | string | null;
  unit: string | null;
  referenceRange: string | null;
  interpretation: string | null;
  observedAt: string | null;
};

export type MedicalVital = {
  name: string;
  value: number | string | null;
  unit: string | null;
  observedAt: string | null;
};

export type MedicalRecord = {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  uploadedAt: string;
  storedPath: string;
  sourceText?: string | null;
  sourceTextOrigin?: string | null;
  status?: "parsed" | "low_confidence" | "needs_review";
  extracted: {
    provider?: string;
    confidence?: number;
    summary: string;
    recordDate: string | null;
    diagnoses: string[];
    medications: string[];
    medicationContexts?: Array<{
      originalName: string;
      normalizedName: string;
      rxcui: string | null;
      tags: string[];
      source: string;
    }>;
    allergies: string[];
    dietaryFlags: string[];
    labResults: MedicalLabResult[];
    vitals: MedicalVital[];
  };
};

export type MealRecommendation = {
  foodId: string;
  title: string;
  whyItFits: string;
  servingSuggestion: string;
  cautions: string[];
};

export type MealRecommendationResponse = {
  plan: {
    reasoningSummary: string;
    searchQueries: string[];
    avoidTerms: string[];
    nutritionPriorities: string[];
  };
  candidates: FoodDetail[];
  summary: string;
  recommendations: MealRecommendation[];
};

export type PlannerCatalogMeal = {
  id: string;
  title: string;
  description: string;
  mealType: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSuggestion: string;
  tags: string[];
  cuisineTags: string[];
  source: string;
  nutritionConfidence: "high" | "medium" | "low";
  popularityScore?: number;
  popularitySignals?: {
    acceptedCount: number;
    passedCount: number;
    loggedCount: number;
    uniqueUserCount: number;
  };
  recipe?: {
    ingredients: string[];
    instructions: string[];
  } | null;
};

export type PlannerFeedbackAction = "accepted" | "passed" | "logged";

export type PlannerCandidate = {
  id: string;
  title: string;
  description: string;
  mealType: string;
  source: string;
  sourceMealId?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSuggestion: string;
  tags: string[];
  cuisineTags: string[];
  nutritionConfidence: "high" | "medium" | "low";
  recipe?: {
    ingredients: string[];
    instructions: string[];
  } | null;
  acceptedCount: number;
  passedCount: number;
  loggedCount: number;
  shownCount: number;
  uniqueUserCount: number;
  status: "candidate" | "review" | "promoted" | "rejected";
  qualityScore: number;
  reviewStatus?: "candidate" | "review" | "promoted" | "rejected";
};

export type MealPlanMeal = {
  mealType: string;
  title: string;
  description: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  servingSuggestion: string;
  whyItFits: string;
  cautions: string[];
  foodId: string;
  recipe?: {
    ingredients: string[];
    instructions: string[];
  } | null;
  alternatives?: Array<{
    title: string;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    servingSuggestion: string;
    whyItFits: string;
    cautions: string[];
    foodId: string;
    recipe?: {
      ingredients: string[];
      instructions: string[];
    } | null;
  }>;
};

export type MealPlan = {
  id: string;
  userId: string;
  planDate: string;
  createdAt: string;
  updatedAt: string;
  userPrompt?: string;
  provider: string;
  aiNotes: string;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  meals: MealPlanMeal[];
  medicalContext: {
    recordCount: number;
    statuses: {
      parsed: number;
      needsReview: number;
      lowConfidence: number;
    };
  };
  medicalContextSignature?: string;
};

export type ManualReadingsInput = {
  hba1c?: number | string;
  fastingGlucose?: number | string;
  randomGlucose?: number | string;
  totalCholesterol?: number | string;
  ldl?: number | string;
  hdl?: number | string;
  triglycerides?: number | string;
  hemoglobin?: number | string;
  ferritin?: number | string;
  creatinine?: number | string;
  urea?: number | string;
  tsh?: number | string;
  vitaminD?: number | string;
  vitaminB12?: number | string;
  uricAcid?: number | string;
  systolicBp?: number | string;
  diastolicBp?: number | string;
  weightKg?: number | string;
  bmi?: number | string;
};

export type MealScanEstimateItem = {
  name: string;
  estimatedPortion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string;
};

export type MealScanEstimate = {
  title: string;
  summary: string;
  portionNote: string;
  confidenceLabel: string;
  items: MealScanEstimateItem[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  estimated: boolean;
  source: string;
};

export type NearbyRestaurantRecommendation = {
  placeId: string;
  name: string;
  address: string | null;
  distanceMeters: number;
  cuisines: string[];
  amenity: string;
  score: number;
  bestFitReason: string;
  suggestedOrder: string;
  avoidNotes: string[];
};

export type NearbyRestaurantResponse = {
  provider: string;
  mealType: string;
  mealTitle: string;
  summary: string;
  searchRadiusMeters: number;
  restaurants: NearbyRestaurantRecommendation[];
};

export type MealLog = {
  id: string;
  date: string;
  consumedAt: string;
  mealType: string;
  quantity: number;
  quantityUnit: string;
  effectiveQuantity?: number;
  food: FoodSearchResult;
  nutrients: Nutrients;
};

export type VoiceMealParseResponse = {
  transcript: string;
  provider: string;
  needsReview?: boolean;
  followUpQuestion?: string | null;
  clarifications?: string[];
  parsed: {
    mealType: string;
    quantity: number;
    portionUnit: string;
    foodQuery: string;
  };
  matches: FoodSearchResult[];
  items: Array<{
    spokenText?: string;
    confidence?: number;
    matched?: boolean;
    needsReview?: boolean;
    clarification?: string;
    transcript: string;
    parsed: {
      mealType: string;
        quantity: number;
        portionUnit: string;
        foodQuery: string;
    };
    matches: FoodSearchResult[];
  }>;
};

export type MealBreakdown = {
  mealType: string;
  label: string;
  timeWindow: string;
  summary: Nutrients & {
    itemCount: number;
  };
  logs: MealLog[];
};

export type WeeklyDaySummary = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
};

export type WeeklyInsights = {
  days: WeeklyDaySummary[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealCount: number;
  };
  averages: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  adherence: number;
  streaks: {
    currentLoggingStreak: number;
    bestLoggingStreak: number;
  };
};

export type WearableMetricValue = {
  label: string;
  value: string;
  observedAt: string | null;
};

export type WearableWorkout = {
  type: string;
  startTime: string;
  endTime: string;
  durationMin: number;
};

export type WearableSnapshot = {
  connected: boolean;
  source: string | null;
  lastSyncedAt: string | null;
  steps: number | null;
  sleepHours: number | null;
  activeCalories: number | null;
  distanceKm: number | null;
  heartRate: WearableMetricValue | null;
  restingHeartRate: WearableMetricValue | null;
  heartRateVariability: WearableMetricValue | null;
  bloodPressure: WearableMetricValue | null;
  bloodGlucose: WearableMetricValue | null;
  weightKg: number | null;
  spo2: WearableMetricValue | null;
  workouts: WearableWorkout[];
};

export type WearableConnectionStatus = {
  configuredDevices: string[];
  connectedDevices: string[];
};

export type HydrationLog = {
  id: string;
  userId: string;
  date: string;
  amountMl: number;
  loggedAt: string;
};

export type DashboardResponse = {
  date: string;
  profile: Profile;
  summary: Nutrients & {
    mealCount: number;
    remainingCalories: number;
    hasIncompleteData: boolean;
    waterIntakeMl: number;
    waterTargetMl: number;
    remainingWaterMl: number;
  };
  logs: MealLog[];
  hydrationLogs: HydrationLog[];
  mealBreakdown: MealBreakdown[];
  recentFoods: FoodSearchResult[];
  favoriteFoods: FoodSearchResult[];
  weeklySummary: WeeklyInsights;
  nutritionBrain: {
    summary: string;
    nextBestAction: {
      title: string;
      detail: string;
      ctaLabel: string;
      ctaMode: string;
    };
    insights: Array<{
      title: string;
      detail: string;
      tone: string;
    }>;
    memory: {
      routineSummary: string;
      favoritePatterns: string[];
    };
  };
};
