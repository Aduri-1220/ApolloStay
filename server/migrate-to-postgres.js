const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  usersPath,
  sessionsPath,
  profileOverridesPath,
  medicalRecordsPath,
  mealLogPath,
  hydrationLogPath,
  mealPlansPath,
  customFoodsPath,
  favoritesPath,
  plannerCandidatesPath,
  reviewedPlannerMealsPath,
  workoutLogsPath,
  workoutExerciseCachePath,
  medicalParserCachePath
} = require("./config");
const { loadMealLogs } = require("./store");
const { readMedicalRecordsRaw } = require("./medical-records");
const { loadCache } = require("./medical-parser-cache");
const { query, runSqlFile, closePool, isPostgresEnabled } = require("./postgres");

function list(records) {
  return Array.isArray(records) ? records : [];
}

function withId(record, prefix) {
  return {
    ...record,
    id: String(record?.id || `${prefix}-${randomUUID()}`)
  };
}

async function markCollection(name, count) {
  await query(
    `INSERT INTO app_collections (collection_name, record_count, migrated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (collection_name)
     DO UPDATE SET record_count = EXCLUDED.record_count, migrated_at = NOW()`,
    [name, count]
  );
}

function getUserId(record) {
  return String(record?.userId || record?.id || "").trim();
}

async function main() {
  if (!isPostgresEnabled()) {
    throw new Error("DATABASE_URL is required to migrate data to PostgreSQL.");
  }

  await runSqlFile(path.join(__dirname, "postgres-schema.sql"));

  const users = list(loadMealLogs(usersPath));
  const knownUserIds = new Set();
  for (const user of users) {
    knownUserIds.add(String(user.id));
    await query(
      `INSERT INTO users (id, public_id, email, name, password_hash, created_at, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET public_id = EXCLUDED.public_id, email = EXCLUDED.email, name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, created_at = EXCLUDED.created_at, raw = EXCLUDED.raw`,
      [String(user.id), user.publicId || null, user.email || null, user.name || null, user.passwordHash || null, user.createdAt || null, JSON.stringify(user)]
    );
  }
  await markCollection("users", users.length);

  const sessions = list(loadMealLogs(sessionsPath));
  let skippedSessions = 0;
  for (const session of sessions) {
    if (!knownUserIds.has(String(session.userId || ""))) {
      skippedSessions += 1;
      continue;
    }
    await query(
      `INSERT INTO sessions (token, user_id, created_at, raw)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (token)
       DO UPDATE SET user_id = EXCLUDED.user_id, created_at = EXCLUDED.created_at, raw = EXCLUDED.raw`,
      [String(session.token), String(session.userId), session.createdAt || null, JSON.stringify(session)]
    );
  }
  await markCollection("sessions", sessions.length);
  if (skippedSessions) {
    console.warn(`Skipped ${skippedSessions} orphan sessions during migration.`);
  }

  const profiles = list(loadMealLogs(profileOverridesPath));
  let skippedProfiles = 0;
  for (const profile of profiles) {
    const userId = String(profile.userId || profile.id || "");
    if (!userId || !knownUserIds.has(userId)) {
      skippedProfiles += 1;
      continue;
    }
    await query(
      `INSERT INTO profiles (user_id, updated_at, raw)
       VALUES ($1, NOW(), $2::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET updated_at = NOW(), raw = EXCLUDED.raw`,
      [userId, JSON.stringify(profile)]
    );
  }
  await markCollection("profiles", profiles.length);
  if (skippedProfiles) {
    console.warn(`Skipped ${skippedProfiles} orphan profiles during migration.`);
  }

  const medicalRecords = list(readMedicalRecordsRaw(medicalRecordsPath));
  let skippedMedicalRecords = 0;
  for (const record of medicalRecords) {
    if (!knownUserIds.has(getUserId(record))) {
      skippedMedicalRecords += 1;
      continue;
    }
    await query(
      `INSERT INTO medical_records (id, user_id, filename, mime_type, uploaded_at, status, parser_version, stored_path, object_key, object_url, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, filename = EXCLUDED.filename, mime_type = EXCLUDED.mime_type, uploaded_at = EXCLUDED.uploaded_at, status = EXCLUDED.status, parser_version = EXCLUDED.parser_version, stored_path = EXCLUDED.stored_path, object_key = EXCLUDED.object_key, object_url = EXCLUDED.object_url, raw = EXCLUDED.raw`,
      [
        String(record.id),
        String(record.userId),
        record.filename || null,
        record.mimeType || null,
        record.uploadedAt || null,
        record.status || null,
        record.parserVersion || null,
        record.storedPath || null,
        record.objectKey || null,
        record.objectUrl || null,
        JSON.stringify(record)
      ]
    );
  }
  await markCollection("medical_records", medicalRecords.length);
  if (skippedMedicalRecords) {
    console.warn(`Skipped ${skippedMedicalRecords} orphan medical records during migration.`);
  }

  const mealLogs = list(loadMealLogs(mealLogPath)).map((item) => withId(item, "meal"));
  let skippedMealLogs = 0;
  for (const log of mealLogs) {
    if (!knownUserIds.has(getUserId(log))) {
      skippedMealLogs += 1;
      continue;
    }
    await query(
      `INSERT INTO meal_logs (id, user_id, meal_type, consumed_at, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, meal_type = EXCLUDED.meal_type, consumed_at = EXCLUDED.consumed_at, raw = EXCLUDED.raw`,
      [log.id, String(log.userId), log.mealType || null, log.consumedAt || log.date || null, JSON.stringify(log)]
    );
  }
  await markCollection("meal_logs", mealLogs.length);
  if (skippedMealLogs) {
    console.warn(`Skipped ${skippedMealLogs} orphan meal logs during migration.`);
  }

  const hydrationLogs = list(loadMealLogs(hydrationLogPath)).map((item) => withId(item, "hydration"));
  let skippedHydrationLogs = 0;
  for (const log of hydrationLogs) {
    if (!knownUserIds.has(getUserId(log))) {
      skippedHydrationLogs += 1;
      continue;
    }
    await query(
      `INSERT INTO hydration_logs (id, user_id, logged_at, raw)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, logged_at = EXCLUDED.logged_at, raw = EXCLUDED.raw`,
      [log.id, String(log.userId), log.loggedAt || log.createdAt || null, JSON.stringify(log)]
    );
  }
  await markCollection("hydration_logs", hydrationLogs.length);
  if (skippedHydrationLogs) {
    console.warn(`Skipped ${skippedHydrationLogs} orphan hydration logs during migration.`);
  }

  const mealPlans = list(loadMealLogs(mealPlansPath)).map((item) => withId(item, "plan"));
  let skippedMealPlans = 0;
  for (const plan of mealPlans) {
    if (!knownUserIds.has(getUserId(plan))) {
      skippedMealPlans += 1;
      continue;
    }
    await query(
      `INSERT INTO meal_plans (id, user_id, plan_date, updated_at, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, plan_date = EXCLUDED.plan_date, updated_at = EXCLUDED.updated_at, raw = EXCLUDED.raw`,
      [plan.id, String(plan.userId), plan.planDate || null, plan.updatedAt || plan.createdAt || null, JSON.stringify(plan)]
    );
  }
  await markCollection("meal_plans", mealPlans.length);
  if (skippedMealPlans) {
    console.warn(`Skipped ${skippedMealPlans} orphan meal plans during migration.`);
  }

  const customFoods = list(loadMealLogs(customFoodsPath));
  let skippedCustomFoods = 0;
  for (const food of customFoods) {
    if (!knownUserIds.has(getUserId(food))) {
      skippedCustomFoods += 1;
      continue;
    }
    await query(
      `INSERT INTO custom_foods (id, user_id, description, barcode, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, description = EXCLUDED.description, barcode = EXCLUDED.barcode, raw = EXCLUDED.raw`,
      [String(food.fdcId || food.id), String(food.userId), food.description || null, food.barcode || null, JSON.stringify(food)]
    );
  }
  await markCollection("custom_foods", customFoods.length);
  if (skippedCustomFoods) {
    console.warn(`Skipped ${skippedCustomFoods} orphan custom foods during migration.`);
  }

  const favorites = list(loadMealLogs(favoritesPath));
  let skippedFavorites = 0;
  for (const favorite of favorites) {
    if (!knownUserIds.has(getUserId(favorite))) {
      skippedFavorites += 1;
      continue;
    }
    await query(
      `INSERT INTO favorite_foods (user_id, food_id, raw)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id, food_id)
       DO UPDATE SET raw = EXCLUDED.raw`,
      [String(favorite.userId), String(favorite.fdcId || favorite.foodId), JSON.stringify(favorite)]
    );
  }
  await markCollection("favorite_foods", favorites.length);
  if (skippedFavorites) {
    console.warn(`Skipped ${skippedFavorites} orphan favorite foods during migration.`);
  }

  const plannerCandidates = list(loadMealLogs(plannerCandidatesPath));
  for (const candidate of plannerCandidates) {
    await query(
      `INSERT INTO planner_candidates (id, meal_type, normalized_title, status, quality_score, updated_at, raw)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET meal_type = EXCLUDED.meal_type, normalized_title = EXCLUDED.normalized_title, status = EXCLUDED.status, quality_score = EXCLUDED.quality_score, updated_at = EXCLUDED.updated_at, raw = EXCLUDED.raw`,
      [
        String(candidate.id),
        candidate.mealType || null,
        candidate.normalizedTitle || null,
        candidate.status || "candidate",
        Number(candidate.qualityScore || 0),
        candidate.reviewedAt || candidate.lastSeenAt || candidate.createdAt || null,
        JSON.stringify(candidate)
      ]
    );
  }
  await markCollection("planner_candidates", plannerCandidates.length);

  const reviewedPlannerMeals = list(loadMealLogs(reviewedPlannerMealsPath));
  for (const meal of reviewedPlannerMeals) {
    await query(
      `INSERT INTO reviewed_planner_meals (id, meal_type, source_candidate_id, reviewed_at, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET meal_type = EXCLUDED.meal_type, source_candidate_id = EXCLUDED.source_candidate_id, reviewed_at = EXCLUDED.reviewed_at, raw = EXCLUDED.raw`,
      [
        String(meal.id),
        meal.mealType || null,
        meal.sourceCandidateId || null,
        meal.reviewedAt || null,
        JSON.stringify(meal)
      ]
    );
  }
  await markCollection("reviewed_planner_meals", reviewedPlannerMeals.length);

  const workoutLogs = list(loadMealLogs(workoutLogsPath)).map((item) => withId(item, "workout"));
  let skippedWorkoutLogs = 0;
  for (const log of workoutLogs) {
    if (!knownUserIds.has(getUserId(log))) {
      skippedWorkoutLogs += 1;
      continue;
    }
    await query(
      `INSERT INTO workout_logs (id, user_id, performed_at, category, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, performed_at = EXCLUDED.performed_at, category = EXCLUDED.category, raw = EXCLUDED.raw`,
      [log.id, String(log.userId), log.performedAt || null, log.category || null, JSON.stringify(log)]
    );
  }
  await markCollection("workout_logs", workoutLogs.length);
  if (skippedWorkoutLogs) {
    console.warn(`Skipped ${skippedWorkoutLogs} orphan workout logs during migration.`);
  }

  const exercises = list(loadMealLogs(workoutExerciseCachePath)).map((item) => withId(item, "exercise"));
  for (const exercise of exercises) {
    await query(
      `INSERT INTO workout_exercises (id, category, raw)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET category = EXCLUDED.category, raw = EXCLUDED.raw`,
      [exercise.id, exercise.category || null, JSON.stringify(exercise)]
    );
  }
  await markCollection("workout_exercises", exercises.length);

  const parserCache = list(loadCache(medicalParserCachePath));
  for (const entry of parserCache) {
    await query(
      `INSERT INTO medical_parser_cache (hash, version, updated_at, raw)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (hash)
       DO UPDATE SET version = EXCLUDED.version, updated_at = EXCLUDED.updated_at, raw = EXCLUDED.raw`,
      [String(entry.hash), entry.version || null, entry.updatedAt || null, JSON.stringify(entry)]
    );
  }
  await markCollection("medical_parser_cache", parserCache.length);

  console.log("JSON stores migrated to PostgreSQL successfully.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
