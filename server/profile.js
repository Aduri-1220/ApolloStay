const fs = require("node:fs");
const { parseCsvLine, parseJsonArrayField } = require("./csv");
const { ensureStore, loadMealLogs, saveMealLogs } = require("./store");
const { isPostgresEnabled, query } = require("./postgres");

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasHadBirthday) {
    age -= 1;
  }

  return age;
}

function calculateBmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) {
    return null;
  }

  const heightMeters = heightCm / 100;
  return Number((weightKg / (heightMeters * heightMeters)).toFixed(1));
}

function containsCondition(values, patterns) {
  const normalized = Array.isArray(values) ? values.map((item) => String(item || "").toLowerCase()) : [];
  return normalized.some((value) => patterns.some((pattern) => pattern.test(value)));
}

function getCalorieFloor({ gender, bmi, activityLevel, medicalConditions, clinicalMetrics }) {
  const normalizedGender = String(gender || "").toLowerCase();
  const normalizedActivity = String(activityLevel || "").toLowerCase();
  const isFemale = normalizedGender.includes("female");

  let floor = isFemale ? 1350 : 1500;

  if (normalizedActivity.includes("moderate")) {
    floor += 50;
  } else if (normalizedActivity.includes("very")) {
    floor += 100;
  }

  if (typeof bmi === "number" && bmi < 18.5) {
    floor += 250;
  } else if (typeof bmi === "number" && bmi < 20) {
    floor += 120;
  }

  const allConditions = [
    ...(Array.isArray(medicalConditions) ? medicalConditions : []),
    ...(Array.isArray(clinicalMetrics?.reportDerivedConditions) ? clinicalMetrics.reportDerivedConditions : [])
  ];

  if (containsCondition(allConditions, [/pregnan/i, /breastfeed/i, /lactat/i])) {
    floor += 250;
  }

  if (containsCondition(allConditions, [/kidney/i, /\bckd\b/i, /renal/i, /dialysis/i])) {
    floor += 150;
  }

  if (containsCondition(allConditions, [/anemi/i, /iron deficien/i])) {
    floor += 100;
  }

  return floor;
}

function calculateDailyCalorieTarget({
  gender,
  weightKg,
  heightCm,
  age,
  activityLevel,
  healthGoals,
  targetWeightKg,
  medicalConditions,
  clinicalMetrics
}) {
  if (!weightKg || !heightCm || !age) {
    return 2000;
  }

  const normalizedGender = String(gender || "").toLowerCase();
  const bmr =
    10 * Number(weightKg) +
    6.25 * Number(heightCm) -
    5 * Number(age) +
    (normalizedGender.includes("female") ? -161 : 5);

  const activity = String(activityLevel || "").toLowerCase();
  const multiplier = activity.includes("very")
    ? 1.725
    : activity.includes("moderate")
      ? 1.55
      : activity.includes("light")
        ? 1.375
        : 1.2;

  const goals = Array.isArray(healthGoals) ? healthGoals.map((item) => String(item).toLowerCase()) : [];
  const bmi = calculateBmi(Number(weightKg), Number(heightCm));
  const targetDelta = Number(targetWeightKg || 0) - Number(weightKg || 0);
  const isWeightLossGoal =
    goals.some((goal) => goal.includes("lose")) || (Number.isFinite(targetDelta) && targetDelta < -0.2);
  const isWeightGainGoal =
    goals.some((goal) => goal.includes("gain") || goal.includes("build")) ||
    (Number.isFinite(targetDelta) && targetDelta > 0.2);

  const allConditions = [
    ...(Array.isArray(medicalConditions) ? medicalConditions : []),
    ...(Array.isArray(clinicalMetrics?.reportDerivedConditions) ? clinicalMetrics.reportDerivedConditions : [])
  ];

  const hasGlucoseOrMetabolicRisk = containsCondition(allConditions, [
    /diabet/i,
    /prediabet/i,
    /insulin/i,
    /pcos/i,
    /metabolic/i
  ]);
  const hasKidneyRisk = containsCondition(allConditions, [/kidney/i, /\bckd\b/i, /renal/i, /dialysis/i]);
  const hasAnemiaRisk =
    containsCondition(allConditions, [/anemi/i, /iron deficien/i]) ||
    /hemoglobin/i.test(String(clinicalMetrics?.hemoglobin?.label || ""));
  const hasThyroidContext = containsCondition(allConditions, [/thyroid/i, /hypothyroid/i, /hyperthyroid/i]);

  let adjustment = 0;

  if (isWeightLossGoal) {
    if (typeof bmi === "number" && bmi >= 30) {
      adjustment = -450;
    } else if (typeof bmi === "number" && bmi >= 25) {
      adjustment = -350;
    } else if (typeof bmi === "number" && bmi >= 21) {
      adjustment = -250;
    } else {
      adjustment = -150;
    }
  } else if (isWeightGainGoal) {
    adjustment = typeof bmi === "number" && bmi < 18.5 ? 300 : 200;
  }

  // Keep deficits gentler when health context suggests more caution.
  if (adjustment < 0) {
    if (hasGlucoseOrMetabolicRisk) {
      adjustment = Math.max(adjustment, -200);
    }
    if (hasKidneyRisk || hasAnemiaRisk || hasThyroidContext) {
      adjustment = Math.max(adjustment, -150);
    }
    if (typeof bmi === "number" && bmi < 20) {
      adjustment = Math.max(adjustment, -100);
    }
  }

  if (adjustment > 0 && hasGlucoseOrMetabolicRisk) {
    adjustment = Math.min(adjustment, 200);
  }

  const maintenanceCalories = bmr * multiplier;
  const floor = getCalorieFloor({
    gender,
    bmi,
    activityLevel,
    medicalConditions: allConditions,
    clinicalMetrics
  });

  return Math.max(floor, Math.round(maintenanceCalories + adjustment));
}

function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function parseCsvProfile(profilePath) {
  if (!fs.existsSync(profilePath)) {
    return null;
  }

  const content = fs.readFileSync(profilePath, "utf8").trim();
  const [headerLine, dataLine] = content.split(/\r?\n/);

  if (!headerLine || !dataLine) {
    throw new Error("Health profile CSV is empty.");
  }

  const headers = parseCsvLine(headerLine);
  const values = parseCsvLine(dataLine);
  const row = {};

  headers.forEach((header, index) => {
    row[header] = values[index];
  });

  return {
    id: row.id,
    publicId: row.public_id || null,
    email: row.created_by,
    name: row.created_by,
    gender: row.gender,
    activityLevel: row.activity_level,
    weightKg: Number(row.weight_kg),
    targetWeightKg: Number(row.target_weight_kg),
    heightCm: Number(row.height_cm),
    dateOfBirth: row.date_of_birth,
    age: calculateAge(row.date_of_birth),
    bmi: calculateBmi(Number(row.weight_kg), Number(row.height_cm)),
    dailyCalorieTarget: Number(row.daily_calorie_target),
    healthGoals: parseJsonArrayField(row.health_goals),
    dietaryPreferences: parseJsonArrayField(row.dietary_preferences),
    likedFoods: [],
    dislikedFoods: [],
    allergies: parseJsonArrayField(row.allergies),
    medicalConditions: parseJsonArrayField(row.medical_conditions),
    mealsPerDay: null,
    mealTimes: {
      breakfast: null,
      lunch: null,
      dinner: null,
      snack: null
    },
    wantsMealReminders: false,
    onboardingCompleted: row.onboarding_completed === "true",
    createdDate: row.created_date,
    updatedDate: row.updated_date
  };
}

function createEmptyProfile(authUser) {
  const now = new Date().toISOString();

  return {
    id: authUser?.id || "local-profile",
    publicId: authUser?.publicId || null,
    email: authUser?.email || "",
    name: authUser?.name || "",
    gender: "",
    activityLevel: "Moderately Active",
    weightKg: 0,
    targetWeightKg: 0,
    heightCm: 0,
    dateOfBirth: "",
    age: null,
    bmi: null,
    dailyCalorieTarget: 2000,
    healthGoals: [],
    dietaryPreferences: [],
    likedFoods: [],
    dislikedFoods: [],
    allergies: [],
    medicalConditions: [],
    mealsPerDay: null,
    mealTimes: {
      breakfast: null,
      lunch: null,
      dinner: null,
      snack: null
    },
    wantsMealReminders: false,
    onboardingCompleted: false,
    createdDate: now,
    updatedDate: now
  };
}

function loadProfileOverrides(profileOverridesPath) {
  ensureStore(profileOverridesPath);
  return loadMealLogs(profileOverridesPath);
}

function saveProfileOverrides(profileOverridesPath, overrides) {
  saveMealLogs(profileOverridesPath, overrides);
}

function getProfileOverride(profileOverridesPath, userId) {
  return loadProfileOverrides(profileOverridesPath).find((item) => item.userId === userId) || null;
}

async function getProfileOverrideRuntime(profileOverridesPath, userId) {
  if (!isPostgresEnabled()) {
    return getProfileOverride(profileOverridesPath, userId);
  }

  const result = await query(
    `
      SELECT raw
      FROM profiles
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0]?.raw || null;
}

function buildClinicalMetrics(medicalRecords) {
  const toTimestamp = (value) => {
    if (!value) {
      return 0;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  };

  const getRecordTimestamp = (record) =>
    Math.max(toTimestamp(record?.extracted?.recordDate), toTimestamp(record?.uploadedAt));

  const records = (medicalRecords || [])
    .filter((record) => (record?.extracted?.confidence ?? 0) >= 0.3)
    .sort((left, right) => getRecordTimestamp(right) - getRecordTimestamp(left));

  const findObservation = (patterns, label) => {
    let bestMatch = null;

    for (const record of records) {
      const observations = [...(record.extracted?.vitals || []), ...(record.extracted?.labResults || [])];

      for (const observation of observations) {
        if (!patterns.some((pattern) => pattern.test(String(observation.name || "")))) {
          continue;
        }

        const observedAt = observation.observedAt || record.extracted?.recordDate || record.uploadedAt;
        const observedTimestamp = Math.max(
          toTimestamp(observation.observedAt),
          toTimestamp(record.extracted?.recordDate),
          toTimestamp(record.uploadedAt)
        );

        if (!bestMatch || observedTimestamp >= bestMatch.timestamp) {
          bestMatch = {
            timestamp: observedTimestamp,
            data: {
              label,
              value: `${observation.value ?? "Unavailable"}${observation.unit ? ` ${observation.unit}` : ""}`,
              observedAt
            }
          };
        }
      }
    }

    return bestMatch ? bestMatch.data : null;
  };

  const latestRecordDate = records.reduce((latest, record) => {
    const candidate = record?.extracted?.recordDate || record?.uploadedAt || null;
    if (!candidate) {
      return latest;
    }
    if (!latest) {
      return candidate;
    }
    return toTimestamp(candidate) >= toTimestamp(latest) ? candidate : latest;
  }, null);

  return {
    latestRecordDate,
    reportDerivedConditions: Array.from(
      new Set(records.flatMap((record) => normalizeStringArray(record?.extracted?.diagnoses || [])))
    ).slice(0, 6),
    bloodPressure: findObservation([/blood pressure/i, /\bbp\b/i], "Blood pressure"),
    bloodGlucose: findObservation([/blood glucose/i, /\bglucose\b/i, /\bfbs\b/i, /\bppbs\b/i], "Blood glucose"),
    heartRate: findObservation([/heart rate/i, /\bpulse\b/i], "Heart rate"),
    hemoglobin: findObservation([/hemoglobin/i, /^\s*hb\b/i], "Hemoglobin")
  };
}

function sanitizeProfileUpdate(input) {
  const next = {};

  if (typeof input.name === "string") {
    next.name = input.name.trim();
  }
  if (typeof input.gender === "string") {
    next.gender = input.gender.trim();
  }
  if (typeof input.activityLevel === "string") {
    next.activityLevel = input.activityLevel.trim();
  }
  if (typeof input.dateOfBirth === "string") {
    next.dateOfBirth = input.dateOfBirth.trim();
  }

  ["weightKg", "targetWeightKg", "heightCm"].forEach((field) => {
    if (input[field] !== undefined) {
      const value = Number(input[field]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Enter a valid ${field}.`);
      }
      next[field] = value;
    }
  });

  ["healthGoals", "dietaryPreferences", "likedFoods", "dislikedFoods", "allergies", "medicalConditions"].forEach((field) => {
    if (input[field] !== undefined) {
      next[field] = normalizeStringArray(input[field]);
    }
  });

  if (input.mealsPerDay !== undefined && input.mealsPerDay !== null) {
    const value = Number(input.mealsPerDay);
    if (!Number.isInteger(value) || value < 2 || value > 6) {
      throw new Error("Enter a valid mealsPerDay.");
    }
    next.mealsPerDay = value;
  } else if (input.mealsPerDay === null) {
    next.mealsPerDay = null;
  }

  if (input.mealTimes !== undefined) {
    const source = input.mealTimes && typeof input.mealTimes === "object" ? input.mealTimes : {};
    next.mealTimes = {
      breakfast: typeof source.breakfast === "string" ? source.breakfast.trim() : null,
      lunch: typeof source.lunch === "string" ? source.lunch.trim() : null,
      dinner: typeof source.dinner === "string" ? source.dinner.trim() : null,
      snack: typeof source.snack === "string" ? source.snack.trim() : null
    };
  }

  if (typeof input.wantsMealReminders === "boolean") {
    next.wantsMealReminders = input.wantsMealReminders;
  }

  if (typeof input.onboardingCompleted === "boolean") {
    next.onboardingCompleted = input.onboardingCompleted;
  }

  return next;
}

function mergeProfile(baseProfile, override, clinicalMetrics) {
  const merged = {
    ...baseProfile,
    ...override
  };

  merged.healthGoals = normalizeStringArray(override?.healthGoals ?? baseProfile.healthGoals);
  merged.dietaryPreferences = normalizeStringArray(override?.dietaryPreferences ?? baseProfile.dietaryPreferences);
  merged.likedFoods = normalizeStringArray(override?.likedFoods ?? baseProfile.likedFoods);
  merged.dislikedFoods = normalizeStringArray(override?.dislikedFoods ?? baseProfile.dislikedFoods);
  merged.allergies = normalizeStringArray(override?.allergies ?? baseProfile.allergies);
  merged.medicalConditions = normalizeStringArray(override?.medicalConditions ?? baseProfile.medicalConditions);
  merged.mealsPerDay =
    override?.mealsPerDay === null || override?.mealsPerDay === undefined
      ? baseProfile.mealsPerDay
      : Number(override.mealsPerDay);
  merged.mealTimes = {
    breakfast: override?.mealTimes?.breakfast ?? baseProfile.mealTimes?.breakfast ?? null,
    lunch: override?.mealTimes?.lunch ?? baseProfile.mealTimes?.lunch ?? null,
    dinner: override?.mealTimes?.dinner ?? baseProfile.mealTimes?.dinner ?? null,
    snack: override?.mealTimes?.snack ?? baseProfile.mealTimes?.snack ?? null
  };
  merged.wantsMealReminders =
    typeof override?.wantsMealReminders === "boolean"
      ? override.wantsMealReminders
      : Boolean(baseProfile.wantsMealReminders);
  merged.age = calculateAge(merged.dateOfBirth);
  merged.bmi = calculateBmi(Number(merged.weightKg), Number(merged.heightCm));
  merged.dailyCalorieTarget = calculateDailyCalorieTarget({
    gender: merged.gender,
    weightKg: merged.weightKg,
    heightCm: merged.heightCm,
    age: merged.age,
    activityLevel: merged.activityLevel,
    healthGoals: merged.healthGoals,
    targetWeightKg: merged.targetWeightKg,
    medicalConditions: merged.medicalConditions,
    clinicalMetrics
  });
  merged.updatedDate = override?.updatedDate || merged.updatedDate;
  merged.clinicalMetrics = clinicalMetrics;

  return merged;
}

async function loadProfile(profilePath, profileOverridesPath, medicalRecords, authUser) {
  const csvProfile = parseCsvProfile(profilePath);
  const shouldUseCsv =
    !!csvProfile &&
    (!authUser ||
      String(csvProfile.email || "").trim().toLowerCase() === String(authUser.email || "").trim().toLowerCase());

  const baseProfile = shouldUseCsv
    ? {
        ...csvProfile,
        id: authUser?.id || csvProfile.id,
        publicId: authUser?.publicId || csvProfile.publicId || null,
        email: authUser?.email || csvProfile.email,
        name: authUser?.name || csvProfile.name
      }
    : createEmptyProfile(authUser);

  const override = authUser ? await getProfileOverrideRuntime(profileOverridesPath, authUser.id) : null;
  return mergeProfile(baseProfile, override, buildClinicalMetrics(medicalRecords));
}

async function updateProfile(profileOverridesPath, authUser, input, existingProfile) {
  const nextValues = sanitizeProfileUpdate(input);
  const now = new Date().toISOString();
  const previous = await getProfileOverrideRuntime(profileOverridesPath, authUser.id);

  const next = {
    userId: authUser.id,
    email: authUser.email,
    createdDate: previous?.createdDate || existingProfile.createdDate || now,
    updatedDate: now,
    ...previous,
    ...nextValues
  };

  if (!isPostgresEnabled()) {
    const overrides = loadProfileOverrides(profileOverridesPath);
    const index = overrides.findIndex((item) => item.userId === authUser.id);

    if (index >= 0) {
      overrides[index] = next;
    } else {
      overrides.push(next);
    }

    saveProfileOverrides(profileOverridesPath, overrides);
    return next;
  }

  await query(
    `
      INSERT INTO profiles (user_id, updated_at, raw)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (user_id)
      DO UPDATE SET
        updated_at = EXCLUDED.updated_at,
        raw = EXCLUDED.raw
    `,
    [authUser.id, now, JSON.stringify(next)]
  );

  return next;
}

module.exports = {
  loadProfile,
  updateProfile,
  calculateBmi,
  calculateAge,
  calculateDailyCalorieTarget
};
