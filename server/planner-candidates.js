const { loadMealLogs, saveMealLogs } = require("./store");

function normalizePlannerCandidateText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeMealType(value) {
  const mealType = normalizePlannerCandidateText(value);
  if (mealType === "breakfast" || mealType === "lunch" || mealType === "snack" || mealType === "dinner") {
    return mealType;
  }
  return "snack";
}

function buildPlannerCandidateKey({ mealType, title }) {
  return `${normalizeMealType(mealType)}:${normalizePlannerCandidateText(title)}`;
}

function loadPlannerCandidates(storePath) {
  return loadMealLogs(storePath);
}

function savePlannerCandidates(storePath, candidates) {
  saveMealLogs(storePath, candidates);
}

function buildPlannerFeedbackIndex(candidates) {
  return (candidates || []).reduce((accumulator, candidate) => {
    accumulator.set(candidate.id, candidate);
    return accumulator;
  }, new Map());
}

function getPlannerCandidateReviewStatus(candidate) {
  if (candidate.status === "promoted" || candidate.status === "rejected") {
    return candidate.status;
  }
  if (
    Number(candidate.acceptedCount || 0) >= 3 ||
    Number(candidate.loggedCount || 0) >= 2 ||
    Number(candidate.uniqueUserCount || 0) >= 2
  ) {
    return "review";
  }
  return "candidate";
}

function scorePlannerCandidate(candidate) {
  const accepted = Number(candidate.acceptedCount || 0);
  const passed = Number(candidate.passedCount || 0);
  const logged = Number(candidate.loggedCount || 0);
  const uniqueUsers = Number(candidate.uniqueUserCount || 0);
  const hasRecipe = Array.isArray(candidate.recipe?.ingredients) && candidate.recipe.ingredients.length > 1 ? 2 : 0;
  const confidence =
    candidate.nutritionConfidence === "high" ? 3 : candidate.nutritionConfidence === "medium" ? 1.5 : 0;
  return accepted * 4 + logged * 5 + uniqueUsers * 3 - passed * 1.5 + hasRecipe + confidence;
}

function updatePlannerCandidateWithFeedback(existingCandidate, feedback) {
  const now = feedback.occurredAt || new Date().toISOString();
  const userIds = new Set(Array.isArray(existingCandidate.userIds) ? existingCandidate.userIds : []);
  if (feedback.userId) {
    userIds.add(String(feedback.userId));
  }

  const next = {
    ...existingCandidate,
    title: feedback.title || existingCandidate.title,
    description: feedback.description || existingCandidate.description,
    mealType: normalizeMealType(feedback.mealType || existingCandidate.mealType),
    source: feedback.source || existingCandidate.source,
    sourceMealId: feedback.sourceMealId || existingCandidate.sourceMealId,
    calories: Number(feedback.calories ?? existingCandidate.calories ?? 0),
    protein: Number(feedback.protein ?? existingCandidate.protein ?? 0),
    carbs: Number(feedback.carbs ?? existingCandidate.carbs ?? 0),
    fat: Number(feedback.fat ?? existingCandidate.fat ?? 0),
    servingSuggestion: feedback.servingSuggestion || existingCandidate.servingSuggestion || "1 serving",
    tags: Array.from(new Set([...(existingCandidate.tags || []), ...(feedback.tags || [])])),
    cuisineTags: Array.from(new Set([...(existingCandidate.cuisineTags || []), ...(feedback.cuisineTags || [])])),
    nutritionConfidence: feedback.nutritionConfidence || existingCandidate.nutritionConfidence || "medium",
    recipe: feedback.recipe || existingCandidate.recipe || null,
    lastSeenAt: now,
    userIds: Array.from(userIds),
    uniqueUserCount: userIds.size
  };

  if (feedback.action === "accepted") {
    next.acceptedCount = Number(next.acceptedCount || 0) + 1;
    next.lastAcceptedAt = now;
  } else if (feedback.action === "passed") {
    next.passedCount = Number(next.passedCount || 0) + 1;
    next.lastPassedAt = now;
  } else if (feedback.action === "logged") {
    next.loggedCount = Number(next.loggedCount || 0) + 1;
    next.lastLoggedAt = now;
  }

  next.shownCount = Number(next.shownCount || 0) + (feedback.action === "passed" || feedback.action === "accepted" ? 1 : 0);
  next.status = getPlannerCandidateReviewStatus(next);
  next.qualityScore = scorePlannerCandidate(next);
  return next;
}

function recordPlannerFeedback(storePath, feedback) {
  const candidates = loadPlannerCandidates(storePath);
  const id = buildPlannerCandidateKey(feedback);
  const existing = candidates.find((candidate) => candidate.id === id);
  const baseCandidate =
    existing ||
    {
      id,
      normalizedTitle: normalizePlannerCandidateText(feedback.title),
      title: feedback.title,
      description: feedback.description || "",
      mealType: normalizeMealType(feedback.mealType),
      source: feedback.source || "planner",
      sourceMealId: feedback.sourceMealId || "",
      calories: Number(feedback.calories || 0),
      protein: Number(feedback.protein || 0),
      carbs: Number(feedback.carbs || 0),
      fat: Number(feedback.fat || 0),
      servingSuggestion: feedback.servingSuggestion || "1 serving",
      tags: Array.isArray(feedback.tags) ? feedback.tags : [],
      cuisineTags: Array.isArray(feedback.cuisineTags) ? feedback.cuisineTags : [],
      nutritionConfidence: feedback.nutritionConfidence || "medium",
      recipe: feedback.recipe || null,
      acceptedCount: 0,
      passedCount: 0,
      loggedCount: 0,
      shownCount: 0,
      uniqueUserCount: 0,
      userIds: [],
      status: "candidate",
      createdAt: feedback.occurredAt || new Date().toISOString()
    };

  const updated = updatePlannerCandidateWithFeedback(baseCandidate, feedback);
  const nextCandidates = existing ? candidates.map((candidate) => (candidate.id === updated.id ? updated : candidate)) : [...candidates, updated];
  savePlannerCandidates(storePath, nextCandidates);
  return updated;
}

function listPlannerCandidatesForReview(storePath) {
  return loadPlannerCandidates(storePath)
    .map((candidate) => ({
      ...candidate,
      qualityScore: scorePlannerCandidate(candidate),
      reviewStatus: getPlannerCandidateReviewStatus(candidate)
    }))
    .sort((left, right) => {
      if (left.reviewStatus !== right.reviewStatus) {
        return left.reviewStatus === "review" ? -1 : 1;
      }
      return Number(right.qualityScore || 0) - Number(left.qualityScore || 0);
    });
}

function loadReviewedPlannerMeals(storePath) {
  return loadMealLogs(storePath);
}

function saveReviewedPlannerMeals(storePath, meals) {
  saveMealLogs(storePath, meals);
}

function promotePlannerCandidate({ candidatesPath, reviewedMealsPath, candidateId, reviewedBy, reviewNotes = "" }) {
  const candidates = loadPlannerCandidates(candidatesPath);
  const candidate = candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return null;
  }

  const reviewedMeals = loadReviewedPlannerMeals(reviewedMealsPath);
  const existingIndex = reviewedMeals.findIndex((meal) => meal.sourceCandidateId === candidateId);
  const reviewedMeal = {
    id: existingIndex >= 0 ? reviewedMeals[existingIndex].id : `reviewed-planner-${candidate.id.replace(/[^a-z0-9_-]/gi, "-")}`,
    title: candidate.title,
    description: candidate.description || candidate.title,
    mealType: normalizeMealType(candidate.mealType),
    calories: Number(candidate.calories || 0),
    protein: Number(candidate.protein || 0),
    carbs: Number(candidate.carbs || 0),
    fat: Number(candidate.fat || 0),
    servingSuggestion: candidate.servingSuggestion || "1 serving",
    tags: candidate.tags || [],
    cuisineTags: candidate.cuisineTags || [],
    source: "reviewed-learning",
    nutritionConfidence: candidate.nutritionConfidence || "medium",
    recipe: candidate.recipe || null,
    sourceCandidateId: candidate.id,
    sourceMealId: candidate.sourceMealId || "",
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    reviewNotes
  };

  if (existingIndex >= 0) {
    reviewedMeals[existingIndex] = reviewedMeal;
  } else {
    reviewedMeals.push(reviewedMeal);
  }
  saveReviewedPlannerMeals(reviewedMealsPath, reviewedMeals);

  const updatedCandidates = candidates.map((item) =>
    item.id === candidateId
      ? {
          ...item,
          status: "promoted",
          promotedReviewedMealId: reviewedMeal.id,
          reviewedAt: reviewedMeal.reviewedAt,
          reviewedBy,
          reviewNotes
        }
      : item
  );
  savePlannerCandidates(candidatesPath, updatedCandidates);

  return reviewedMeal;
}

function rejectPlannerCandidate({ candidatesPath, candidateId, reviewedBy, reviewNotes = "" }) {
  const candidates = loadPlannerCandidates(candidatesPath);
  const candidate = candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return null;
  }
  const updated = candidates.map((item) =>
    item.id === candidateId
      ? {
          ...item,
          status: "rejected",
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          reviewNotes
        }
      : item
  );
  savePlannerCandidates(candidatesPath, updated);
  return updated.find((item) => item.id === candidateId) || null;
}

module.exports = {
  normalizePlannerCandidateText,
  buildPlannerCandidateKey,
  loadPlannerCandidates,
  savePlannerCandidates,
  buildPlannerFeedbackIndex,
  recordPlannerFeedback,
  listPlannerCandidatesForReview,
  loadReviewedPlannerMeals,
  promotePlannerCandidate,
  rejectPlannerCandidate
};
