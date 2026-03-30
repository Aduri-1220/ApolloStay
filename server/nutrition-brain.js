function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function average(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildMealHistory(allLogs, mealType) {
  const filtered = allLogs.filter((log) => log.mealType === mealType);
  const hourValues = filtered
    .map((log) => new Date(log.consumedAt).getHours() + new Date(log.consumedAt).getMinutes() / 60)
    .filter((value) => Number.isFinite(value));
  const foodCounts = filtered.reduce((accumulator, log) => {
    const key = String(log.food?.description || "").trim();
    if (!key) {
      return accumulator;
    }
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  return {
    count: filtered.length,
    averageHour: average(hourValues),
    topFood:
      Object.entries(foodCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || null
  };
}

function buildMemory(allLogs) {
  const breakfast = buildMealHistory(allLogs, "breakfast");
  const lunch = buildMealHistory(allLogs, "lunch");
  const dinner = buildMealHistory(allLogs, "dinner");
  const snack = buildMealHistory(allLogs, "snack");

  const routineNotes = [];
  if (breakfast.count >= 3 && breakfast.averageHour !== null) {
    routineNotes.push(`You usually log breakfast around ${Math.floor(breakfast.averageHour)}:${String(Math.round((breakfast.averageHour % 1) * 60)).padStart(2, "0")}.`);
  }
  if (breakfast.topFood) {
    routineNotes.push(`Your most common breakfast recently is ${breakfast.topFood}.`);
  }
  if (snack.topFood) {
    routineNotes.push(`Your most repeated snack is ${snack.topFood}.`);
  }

  return {
    breakfast,
    lunch,
    dinner,
    snack,
    routineSummary: routineNotes[0] || "Keep logging meals for a few days to unlock routine memory.",
    favoritePatterns: routineNotes.slice(1, 3)
  };
}

function buildNextBestAction({ profile, summary, waterTargetMl, waterIntakeMl, memory, dailyLogs }) {
  const proteinTarget = Math.max(50, Math.round((profile?.weightKg || 0) * 1.2) || 90);
  const proteinGap = Math.max(0, proteinTarget - Number(summary?.protein || 0));
  const waterGap = Math.max(0, waterTargetMl - waterIntakeMl);
  const currentHour = new Date().getHours();
  const loggedMeals = new Set(dailyLogs.map((log) => log.mealType));

  if (proteinGap >= 20) {
    return {
      title: "Close your protein gap",
      detail: `You are about ${Math.round(proteinGap)} g short of today's protein target. A quick paneer, egg, yogurt, or dal add-on will help.`,
      ctaLabel: "Log a protein meal",
      ctaMode: "search"
    };
  }

  if (waterGap >= 500) {
    return {
      title: "Catch up on hydration",
      detail: `You still have ${Math.round(waterGap)} ml left to hit today's water target.`,
      ctaLabel: "Add water",
      ctaMode: "hydration"
    };
  }

  if (currentHour >= 10 && !loggedMeals.has("breakfast") && memory.breakfast.count >= 3) {
    return {
      title: "Don't skip your usual breakfast",
      detail: memory.breakfast.topFood
        ? `You often start the day with ${memory.breakfast.topFood}. Logging breakfast now will keep your day on track.`
        : "You usually log breakfast by now. Add something simple to avoid a late calorie catch-up.",
      ctaLabel: "Voice log breakfast",
      ctaMode: "voice"
    };
  }

  if (currentHour >= 14 && !loggedMeals.has("lunch") && memory.lunch.count >= 3) {
    return {
      title: "Plan your lunch before energy dips",
      detail: memory.lunch.topFood
        ? `A balanced lunch like ${memory.lunch.topFood} fits your recent pattern.`
        : "You usually have lunch by this time. Add one balanced meal before evening hunger builds up.",
      ctaLabel: "Get lunch ideas",
      ctaMode: "meal-plan"
    };
  }

  return {
    title: "Stay consistent with logging",
    detail: summary.mealCount > 0
      ? "One more balanced entry today will make your recommendations sharper."
      : "Start with one meal log and the app can personalize the rest of the day.",
    ctaLabel: "Log food",
    ctaMode: "search"
  };
}

function buildNutritionBrain({ profile, summary, weeklySummary, waterTargetMl, waterIntakeMl, dailyLogs, allLogs }) {
  const memory = buildMemory(allLogs.slice(0, 120));
  const proteinTarget = Math.max(50, Math.round((profile?.weightKg || 0) * 1.2) || 90);
  const calorieDeltaVsWeek = round(Number(summary?.calories || 0) - Number(weeklySummary?.averages?.calories || 0));
  const nextBestAction = buildNextBestAction({
    profile,
    summary,
    waterTargetMl,
    waterIntakeMl,
    memory,
    dailyLogs
  });

  const insights = [
    {
      title: "Protein target",
      detail:
        Number(summary?.protein || 0) >= proteinTarget
          ? `You already hit your protein goal for today.`
          : `You are ${Math.max(0, Math.round(proteinTarget - Number(summary?.protein || 0)))} g below your protein target.`,
      tone: Number(summary?.protein || 0) >= proteinTarget ? "win" : "focus"
    },
    {
      title: "Weekly rhythm",
      detail:
        calorieDeltaVsWeek === 0
          ? "Today's calories are in line with your weekly average."
          : `Today's calories are ${Math.abs(calorieDeltaVsWeek)} kcal ${calorieDeltaVsWeek > 0 ? "above" : "below"} your weekly average.`,
      tone: calorieDeltaVsWeek > 180 ? "warn" : "focus"
    },
    {
      title: "Personal pattern",
      detail: memory.routineSummary,
      tone: "memory"
    }
  ];

  return {
    summary:
      nextBestAction.detail,
    nextBestAction,
    insights,
    memory: {
      routineSummary: memory.routineSummary,
      favoritePatterns: memory.favoritePatterns
    }
  };
}

module.exports = {
  buildNutritionBrain
};
