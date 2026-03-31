CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  public_id TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS medical_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ,
  status TEXT,
  parser_version INTEGER,
  stored_path TEXT,
  object_key TEXT,
  object_url TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS medical_records_user_id_idx ON medical_records(user_id);
CREATE INDEX IF NOT EXISTS medical_records_uploaded_at_idx ON medical_records(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS meal_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_type TEXT,
  consumed_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS meal_logs_user_id_idx ON meal_logs(user_id);
CREATE INDEX IF NOT EXISTS meal_logs_consumed_at_idx ON meal_logs(consumed_at DESC);

CREATE TABLE IF NOT EXISTS hydration_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date DATE,
  updated_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS meal_plans_user_id_idx ON meal_plans(user_id);
CREATE INDEX IF NOT EXISTS meal_plans_plan_date_idx ON meal_plans(plan_date DESC);

CREATE TABLE IF NOT EXISTS custom_foods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  barcode TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS custom_foods_user_id_idx ON custom_foods(user_id);
CREATE INDEX IF NOT EXISTS custom_foods_barcode_idx ON custom_foods(barcode);

CREATE TABLE IF NOT EXISTS favorite_foods (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_id TEXT NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, food_id)
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_at TIMESTAMPTZ,
  category TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  category TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS medical_parser_cache (
  hash TEXT PRIMARY KEY,
  version INTEGER,
  updated_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app_collections (
  collection_name TEXT PRIMARY KEY,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS planner_candidates (
  id TEXT PRIMARY KEY,
  meal_type TEXT,
  normalized_title TEXT,
  status TEXT,
  quality_score DOUBLE PRECISION DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS planner_candidates_meal_type_idx ON planner_candidates(meal_type);
CREATE INDEX IF NOT EXISTS planner_candidates_status_idx ON planner_candidates(status);
CREATE INDEX IF NOT EXISTS planner_candidates_quality_score_idx ON planner_candidates(quality_score DESC);

CREATE TABLE IF NOT EXISTS reviewed_planner_meals (
  id TEXT PRIMARY KEY,
  meal_type TEXT,
  source_candidate_id TEXT,
  reviewed_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS reviewed_planner_meals_meal_type_idx ON reviewed_planner_meals(meal_type);
CREATE INDEX IF NOT EXISTS reviewed_planner_meals_source_candidate_idx ON reviewed_planner_meals(source_candidate_id);
