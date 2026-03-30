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

async function main() {
  if (!isPostgresEnabled()) {
    throw new Error("DATABASE_URL is required to migrate data to PostgreSQL.");
  }

  await runSqlFile(path.join(__dirname, "postgres-schema.sql"));

  const users = list(loadMealLogs(usersPath));
  for (const user of users) {
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
  for (const session of sessions) {
    await query(
      `INSERT INTO sessions (token, user_id, created_at, raw)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (token)
       DO UPDATE SET user_id = EXCLUDED.user_id, created_at = EXCLUDED.created_at, raw = EXCLUDED.raw`,
      [String(session.token), String(session.userId), session.createdAt || null, JSON.stringify(session)]
    );
  }
  await markCollection("sessions", sessions.length);

  const profiles = list(loadMealLogs(profileOverridesPath));
  for (const profile of profiles) {
    const userId = String(profile.userId || profile.id || "");
    if (!userId) continue;
    await query(
      `INSERT INTO profiles (user_id, updated_at, raw)
       VALUES ($1, NOW(), $2::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET updated_at = NOW(), raw = EXCLUDED.raw`,
      [userId, JSON.stringify(profile)]
    );
  }
  await markCollection("profiles", profiles.length);

  const medicalRecords = list(readMedicalRecordsRaw(medicalRecordsPath));
  for (const record of medicalRecords) {
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

  const mealLogs = list(loadMealLogs(mealLogPath)).map((item) => withId(item, "meal"));
  for (const log of mealLogs) {
    await query(
      `INSERT INTO meal_logs (id, user_id, meal_type, consumed_at, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, meal_type = EXCLUDED.meal_type, consumed_at = EXCLUDED.consumed_at, raw = EXCLUDED.raw`,
      [log.id, String(log.userId), log.mealType || null, log.consumedAt || log.date || null, JSON.stringify(log)]
    );
  }
  await markCollection("meal_logs", mealLogs.length);

  const hydrationLogs = list(loadMealLogs(hydrationLogPath)).map((item) => withId(item, "hydration"));
  for (const log of hydrationLogs) {
    await query(
      `INSERT INTO hydration_logs (id, user_id, logged_at, raw)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, logged_at = EXCLUDED.logged_at, raw = EXCLUDED.raw`,
      [log.id, String(log.userId), log.loggedAt || log.createdAt || null, JSON.stringify(log)]
    );
  }
  await markCollection("hydration_logs", hydrationLogs.length);

  const mealPlans = list(loadMealLogs(mealPlansPath)).map((item) => withId(item, "plan"));
  for (const plan of mealPlans) {
    await query(
      `INSERT INTO meal_plans (id, user_id, plan_date, updated_at, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, plan_date = EXCLUDED.plan_date, updated_at = EXCLUDED.updated_at, raw = EXCLUDED.raw`,
      [plan.id, String(plan.userId), plan.planDate || null, plan.updatedAt || plan.createdAt || null, JSON.stringify(plan)]
    );
  }
  await markCollection("meal_plans", mealPlans.length);

  const customFoods = list(loadMealLogs(customFoodsPath));
  for (const food of customFoods) {
    await query(
      `INSERT INTO custom_foods (id, user_id, description, barcode, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, description = EXCLUDED.description, barcode = EXCLUDED.barcode, raw = EXCLUDED.raw`,
      [String(food.fdcId || food.id), String(food.userId), food.description || null, food.barcode || null, JSON.stringify(food)]
    );
  }
  await markCollection("custom_foods", customFoods.length);

  const favorites = list(loadMealLogs(favoritesPath));
  for (const favorite of favorites) {
    await query(
      `INSERT INTO favorite_foods (user_id, food_id, raw)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id, food_id)
       DO UPDATE SET raw = EXCLUDED.raw`,
      [String(favorite.userId), String(favorite.fdcId || favorite.foodId), JSON.stringify(favorite)]
    );
  }
  await markCollection("favorite_foods", favorites.length);

  const workoutLogs = list(loadMealLogs(workoutLogsPath)).map((item) => withId(item, "workout"));
  for (const log of workoutLogs) {
    await query(
      `INSERT INTO workout_logs (id, user_id, performed_at, category, raw)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id, performed_at = EXCLUDED.performed_at, category = EXCLUDED.category, raw = EXCLUDED.raw`,
      [log.id, String(log.userId), log.performedAt || null, log.category || null, JSON.stringify(log)]
    );
  }
  await markCollection("workout_logs", workoutLogs.length);

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
