const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const parsedSessionTtlDays = Number(process.env.SESSION_TTL_DAYS || (isProduction ? 14 : 30));
const parsedMaxRequestBodyBytes = Number(process.env.MAX_REQUEST_BODY_BYTES || 12 * 1024 * 1024);
const parsedMaxMedicalUploadBytes = Number(process.env.MAX_MEDICAL_UPLOAD_BYTES || 10 * 1024 * 1024);
const parsedMaxMealScanBytes = Number(process.env.MAX_MEAL_SCAN_BYTES || 6 * 1024 * 1024);
const parsedMaxVoiceUploadBytes = Number(process.env.MAX_VOICE_UPLOAD_BYTES || 8 * 1024 * 1024);
const customFoodReviewUsageThreshold = Number(process.env.CUSTOM_FOOD_REVIEW_USAGE_THRESHOLD || 5);
const adminEmails = String(process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

module.exports = {
  isProduction,
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 4000),
  workspaceRoot,
  allowedOrigins,
  sessionTtlDays: Number.isFinite(parsedSessionTtlDays) && parsedSessionTtlDays > 0 ? parsedSessionTtlDays : 30,
  maxRequestBodyBytes: Number.isFinite(parsedMaxRequestBodyBytes) && parsedMaxRequestBodyBytes > 0 ? parsedMaxRequestBodyBytes : 12 * 1024 * 1024,
  maxMedicalUploadBytes: Number.isFinite(parsedMaxMedicalUploadBytes) && parsedMaxMedicalUploadBytes > 0 ? parsedMaxMedicalUploadBytes : 10 * 1024 * 1024,
  maxMealScanBytes: Number.isFinite(parsedMaxMealScanBytes) && parsedMaxMealScanBytes > 0 ? parsedMaxMealScanBytes : 6 * 1024 * 1024,
  maxVoiceUploadBytes: Number.isFinite(parsedMaxVoiceUploadBytes) && parsedMaxVoiceUploadBytes > 0 ? parsedMaxVoiceUploadBytes : 8 * 1024 * 1024,
  customFoodReviewUsageThreshold:
    Number.isFinite(customFoodReviewUsageThreshold) && customFoodReviewUsageThreshold > 0 ? customFoodReviewUsageThreshold : 5,
  adminEmails,
  allowLocalOnlyUploads: !isProduction || process.env.ALLOW_LOCAL_ONLY_UPLOADS === "true",
  databaseUrl: process.env.DATABASE_URL || "",
  objectStorageProvider: process.env.OBJECT_STORAGE_PROVIDER || "",
  objectStorageBucket: process.env.OBJECT_STORAGE_BUCKET || process.env.S3_BUCKET || "",
  objectStorageRegion: process.env.OBJECT_STORAGE_REGION || process.env.AWS_REGION || "auto",
  objectStorageEndpoint: process.env.OBJECT_STORAGE_ENDPOINT || process.env.S3_ENDPOINT || "",
  objectStorageAccessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
  objectStorageSecretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  objectStoragePublicBaseUrl: process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || "",
  mealLogPath: path.join(workspaceRoot, "data", "meal-logs.json"),
  hydrationLogPath: path.join(workspaceRoot, "data", "hydration-logs.json"),
  mealPlansPath: path.join(workspaceRoot, "data", "meal-plans.json"),
  workoutLogsPath: path.join(workspaceRoot, "data", "workout-logs.json"),
  workoutExerciseCachePath: path.join(workspaceRoot, "data", "workout-exercises.json"),
  catalogOverridesPath: path.join(workspaceRoot, "data", "catalog-overrides.json"),
  profileOverridesPath: path.join(workspaceRoot, "data", "profile-overrides.json"),
  medicalParserCachePath: path.join(workspaceRoot, "data", "medical-parser-cache.json"),
  customFoodsPath: path.join(workspaceRoot, "data", "custom-foods.json"),
  favoritesPath: path.join(workspaceRoot, "data", "favorite-foods.json"),
  plannerCandidatesPath: path.join(workspaceRoot, "data", "planner-candidates.json"),
  reviewedPlannerMealsPath: path.join(workspaceRoot, "data", "reviewed-planner-meals.json"),
  usersPath: path.join(workspaceRoot, "data", "users.json"),
  sessionsPath: path.join(workspaceRoot, "data", "sessions.json"),
  medicalRecordsPath: path.join(workspaceRoot, "data", "medical-records.json"),
  uploadsDir: path.join(workspaceRoot, "data", "uploads"),
  healthProfilePath:
    process.env.HEALTH_PROFILE_CSV ||
    "/Users/chinnicherrishmareddyaduri/Downloads/HealthProfile_export.csv",
  foodCsvPath:
    process.env.FOOD_CSV ||
    "/Users/chinnicherrishmareddyaduri/Downloads/FoodData_Central_foundation_food_csv_2025-12-18/food.csv",
  foundationFoodCsvPath:
    process.env.FOUNDATION_FOOD_CSV ||
    "/Users/chinnicherrishmareddyaduri/Downloads/FoodData_Central_foundation_food_csv_2025-12-18/foundation_food.csv",
  foodNutrientCsvPath:
    process.env.FOOD_NUTRIENT_CSV ||
    "/Users/chinnicherrishmareddyaduri/Downloads/FoodData_Central_foundation_food_csv_2025-12-18/food_nutrient.csv",
  indianNutritionZipPath:
    process.env.INDIAN_NUTRITION_ZIP ||
    "/Users/chinnicherrishmareddyaduri/Downloads/indian_food1.zip",
  indianMealsZipPath:
    process.env.INDIAN_MEALS_ZIP ||
    "/Users/chinnicherrishmareddyaduri/Downloads/Indian_food2.zip",
  fnddsMainFoodCsvPath:
    process.env.FNDDS_MAIN_FOOD_CSV || path.join(workspaceRoot, "data", "fndds", "fndds_main_food.csv"),
  fnddsNutrientCsvPath:
    process.env.FNDDS_NUTRIENT_CSV || path.join(workspaceRoot, "data", "fndds", "fndds_nutrient_values.csv")
};
