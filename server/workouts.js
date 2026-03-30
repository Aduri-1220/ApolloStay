const { randomUUID } = require("node:crypto");
const { ensureStore, loadMealLogs, saveMealLogs } = require("./store");
const { workoutLogsPath, workoutExerciseCachePath } = require("./config");
const { isPostgresEnabled, query } = require("./postgres");

const FALLBACK_EXERCISES = [
  {
    id: "workout-1",
    name: "Brisk Walking",
    category: "Cardio",
    durationMinutes: 30,
    caloriesBurned: 140,
    difficulty: "Beginner",
    equipment: "None",
    muscleGroups: ["Full body"],
    instructions: [
      "Walk at a pace that makes talking possible but slightly challenging.",
      "Keep shoulders relaxed and swing your arms naturally.",
      "Aim to maintain the pace for the full duration."
    ]
  },
  {
    id: "workout-2",
    name: "Treadmill Intervals",
    category: "Cardio",
    durationMinutes: 25,
    caloriesBurned: 220,
    difficulty: "Intermediate",
    equipment: "Treadmill",
    muscleGroups: ["Legs", "Cardio"],
    instructions: [
      "Warm up for 5 minutes at an easy pace.",
      "Alternate 1 minute fast with 2 minutes easy for 6 rounds.",
      "Cool down for 5 minutes."
    ]
  },
  {
    id: "workout-3",
    name: "Bodyweight Strength Circuit",
    category: "Strength",
    durationMinutes: 35,
    caloriesBurned: 180,
    difficulty: "Beginner",
    equipment: "None",
    muscleGroups: ["Chest", "Legs", "Core"],
    instructions: [
      "Complete 3 rounds of squats, incline push-ups, lunges, and planks.",
      "Rest 45 seconds between rounds.",
      "Move with controlled form rather than speed."
    ]
  },
  {
    id: "workout-4",
    name: "Upper Body Dumbbell Session",
    category: "Strength",
    durationMinutes: 40,
    caloriesBurned: 210,
    difficulty: "Intermediate",
    equipment: "Dumbbells",
    muscleGroups: ["Shoulders", "Back", "Arms"],
    instructions: [
      "Perform shoulder press, bent-over row, curls, and tricep extensions.",
      "Use 3 sets of 10 to 12 reps per movement.",
      "Rest 60 seconds between sets."
    ]
  },
  {
    id: "workout-5",
    name: "Lower Body Strength",
    category: "Strength",
    durationMinutes: 40,
    caloriesBurned: 240,
    difficulty: "Intermediate",
    equipment: "Dumbbells",
    muscleGroups: ["Glutes", "Quads", "Hamstrings"],
    instructions: [
      "Perform goblet squats, Romanian deadlifts, step-ups, and calf raises.",
      "Complete 3 rounds with controlled tempo.",
      "Rest 60 seconds between rounds."
    ]
  },
  {
    id: "workout-6",
    name: "Mobility Reset",
    category: "Mobility",
    durationMinutes: 20,
    caloriesBurned: 60,
    difficulty: "Beginner",
    equipment: "Mat",
    muscleGroups: ["Hips", "Back", "Shoulders"],
    instructions: [
      "Move through cat-cow, thoracic rotations, hip openers, and hamstring stretches.",
      "Hold each stretch for 30 to 45 seconds.",
      "Breathe slowly and avoid forcing range."
    ]
  },
  {
    id: "workout-7",
    name: "Desk Stretch Flow",
    category: "Mobility",
    durationMinutes: 12,
    caloriesBurned: 35,
    difficulty: "Beginner",
    equipment: "Chair",
    muscleGroups: ["Neck", "Shoulders", "Back"],
    instructions: [
      "Complete neck rolls, chest opens, seated twists, and hamstring reaches.",
      "Keep movements smooth and pain-free."
    ]
  },
  {
    id: "workout-8",
    name: "Morning Yoga Flow",
    category: "Yoga",
    durationMinutes: 25,
    caloriesBurned: 90,
    difficulty: "Beginner",
    equipment: "Mat",
    muscleGroups: ["Full body"],
    instructions: [
      "Move through sun salutations, low lunge, downward dog, and child's pose.",
      "Match movement with breath."
    ]
  },
  {
    id: "workout-9",
    name: "Power Yoga Session",
    category: "Yoga",
    durationMinutes: 35,
    caloriesBurned: 170,
    difficulty: "Intermediate",
    equipment: "Mat",
    muscleGroups: ["Core", "Legs", "Shoulders"],
    instructions: [
      "Flow through warrior sequences, chair pose, plank holds, and balance poses.",
      "Keep core engaged through transitions."
    ]
  },
  {
    id: "workout-10",
    name: "Beginner HIIT",
    category: "HIIT",
    durationMinutes: 18,
    caloriesBurned: 160,
    difficulty: "Beginner",
    equipment: "None",
    muscleGroups: ["Full body"],
    instructions: [
      "Alternate 30 seconds work and 30 seconds rest.",
      "Use marching jacks, air squats, step-back lunges, and mountain climbers."
    ]
  },
  {
    id: "workout-11",
    name: "Advanced HIIT Blast",
    category: "HIIT",
    durationMinutes: 22,
    caloriesBurned: 240,
    difficulty: "Advanced",
    equipment: "None",
    muscleGroups: ["Full body"],
    instructions: [
      "Alternate 40 seconds work and 20 seconds rest.",
      "Use burpees, jump squats, skaters, and plank jacks."
    ]
  },
  {
    id: "workout-12",
    name: "Cycling Session",
    category: "Cardio",
    durationMinutes: 45,
    caloriesBurned: 280,
    difficulty: "Intermediate",
    equipment: "Bike",
    muscleGroups: ["Legs", "Cardio"],
    instructions: [
      "Warm up for 8 minutes.",
      "Ride at a moderate pace with 5 short harder pushes.",
      "Cool down for the final 5 minutes."
    ]
  }
];

function ensureWorkoutStores() {
  if (isPostgresEnabled()) {
    return;
  }
  ensureStore(workoutLogsPath);
  ensureStore(workoutExerciseCachePath);
  const cached = loadMealLogs(workoutExerciseCachePath);
  if (!Array.isArray(cached) || cached.length === 0) {
    saveMealLogs(workoutExerciseCachePath, FALLBACK_EXERCISES);
  }
}

async function loadExerciseLibrary() {
  ensureWorkoutStores();
  if (isPostgresEnabled()) {
    const result = await query(
      `
        SELECT raw
        FROM workout_exercises
        ORDER BY category ASC, id ASC
      `
    );
    if (result.rows.length > 0) {
      return result.rows.map((row) => row.raw);
    }

    for (const exercise of FALLBACK_EXERCISES) {
      await query(
        `
          INSERT INTO workout_exercises (id, category, raw)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            category = EXCLUDED.category,
            raw = EXCLUDED.raw
        `,
        [exercise.id, exercise.category || null, JSON.stringify(exercise)]
      );
    }
    return FALLBACK_EXERCISES;
  }
  const cached = loadMealLogs(workoutExerciseCachePath);
  return Array.isArray(cached) && cached.length > 0 ? cached : FALLBACK_EXERCISES;
}

async function loadWorkoutLogs() {
  ensureWorkoutStores();
  if (isPostgresEnabled()) {
    const result = await query(
      `
        SELECT raw
        FROM workout_logs
        ORDER BY performed_at DESC NULLS LAST
      `
    );
    return result.rows.map((row) => row.raw);
  }
  return loadMealLogs(workoutLogsPath);
}

async function saveWorkoutLogs(logs) {
  if (isPostgresEnabled()) {
    await query("BEGIN");
    try {
      await query("TRUNCATE TABLE workout_logs");
      for (const log of logs) {
        await query(
          `
            INSERT INTO workout_logs (id, user_id, performed_at, category, raw)
            VALUES ($1, $2, $3, $4, $5::jsonb)
          `,
          [log.id, log.userId, log.performedAt || null, log.category || null, JSON.stringify(log)]
        );
      }
      await query("COMMIT");
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
    return;
  }
  saveMealLogs(workoutLogsPath, logs);
}

async function listWorkoutLogsForUser(userId) {
  return (await loadWorkoutLogs())
    .filter((entry) => entry.userId === userId)
    .sort((left, right) => new Date(right.performedAt).getTime() - new Date(left.performedAt).getTime());
}

async function getWorkoutStats(userId) {
  const logs = await listWorkoutLogsForUser(userId);
  const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = logs.filter((entry) => new Date(entry.performedAt).getTime() >= last7Days);

  const totals = recent.reduce(
    (accumulator, entry) => {
      accumulator.sessions += 1;
      accumulator.minutes += Number(entry.durationMinutes || 0);
      accumulator.calories += Number(entry.caloriesBurned || 0);
      return accumulator;
    },
    { sessions: 0, minutes: 0, calories: 0 }
  );

  const categoryCounts = logs.reduce((accumulator, entry) => {
    const category = entry.category || "Other";
    accumulator[category] = (accumulator[category] || 0) + 1;
    return accumulator;
  }, {});

  const favoriteCategory =
    Object.entries(categoryCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || "Not enough data";

  return {
    weeklySessions: totals.sessions,
    weeklyMinutes: totals.minutes,
    weeklyCalories: totals.calories,
    favoriteCategory,
    latestWorkout: logs[0] || null
  };
}

async function listWorkoutCategories() {
  return Array.from(new Set((await loadExerciseLibrary()).map((exercise) => exercise.category))).sort();
}

async function searchExercises(query, category) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const normalizedCategory = String(category || "").trim().toLowerCase();

  return (await loadExerciseLibrary()).filter((exercise) => {
    if (normalizedCategory && normalizedCategory !== "all" && exercise.category.toLowerCase() !== normalizedCategory) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      exercise.name.toLowerCase().includes(normalizedQuery) ||
      exercise.category.toLowerCase().includes(normalizedQuery) ||
      (exercise.muscleGroups || []).some((group) => group.toLowerCase().includes(normalizedQuery))
    );
  });
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request
      .on("data", (chunk) => chunks.push(chunk))
      .on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch (error) {
          reject(error);
        }
      })
      .on("error", reject);
  });
}

async function createWorkoutLog(userId, payload) {
  const exercise = payload.exerciseId
    ? (await loadExerciseLibrary()).find((item) => item.id === payload.exerciseId)
    : null;

  const title = String(payload.title || exercise?.name || "").trim();
  if (!title) {
    throw new Error("Workout title is required.");
  }

  const durationMinutes = Number(payload.durationMinutes || exercise?.durationMinutes || 0);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duration must be greater than 0.");
  }

  return {
    id: randomUUID(),
    userId,
    exerciseId: exercise?.id || payload.exerciseId || null,
    title,
    category: String(payload.category || exercise?.category || "Workout"),
    durationMinutes: Math.round(durationMinutes),
    caloriesBurned: Number.isFinite(Number(payload.caloriesBurned))
      ? Math.round(Number(payload.caloriesBurned))
      : Number(exercise?.caloriesBurned || 0) || null,
    difficulty: String(payload.difficulty || exercise?.difficulty || "Custom"),
    equipment: String(payload.equipment || exercise?.equipment || "None"),
    muscleGroups: Array.isArray(payload.muscleGroups) && payload.muscleGroups.length > 0
      ? payload.muscleGroups
      : exercise?.muscleGroups || [],
    notes: String(payload.notes || "").trim(),
    performedAt: payload.performedAt || new Date().toISOString()
  };
}

async function handleWorkoutRoutes({ request, response, url, authUser, sendJson }) {
  if (!url.pathname.startsWith("/workouts")) {
    return false;
  }

  ensureWorkoutStores();

  if (request.method === "GET" && url.pathname === "/workouts/stats") {
    sendJson(response, 200, await getWorkoutStats(authUser.id));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/workouts/logs") {
    sendJson(response, 200, await listWorkoutLogsForUser(authUser.id));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/workouts/categories") {
    sendJson(response, 200, await listWorkoutCategories());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/workouts/exercises") {
    const query = url.searchParams.get("query") || "";
    const category = url.searchParams.get("category") || "";
    sendJson(response, 200, await searchExercises(query, category));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/workouts/logs") {
    try {
      const payload = await readJsonBody(request);
      const nextEntry = await createWorkoutLog(authUser.id, payload);
      const logs = await loadWorkoutLogs();
      logs.push(nextEntry);
      await saveWorkoutLogs(logs);
      sendJson(response, 201, nextEntry);
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Could not save workout log." });
    }
    return true;
  }

  return false;
}

module.exports = {
  handleWorkoutRoutes
};
