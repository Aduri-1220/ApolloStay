const compositionCache = new Map();

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function emptyMacros() {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };
}

function scalePer100g(nutrientsPer100g, grams) {
  if (!nutrientsPer100g || !Number.isFinite(grams) || grams <= 0) {
    return emptyMacros();
  }

  const factor = grams / 100;
  return {
    calories: round((nutrientsPer100g.calories || 0) * factor),
    protein: round((nutrientsPer100g.protein || 0) * factor),
    carbs: round((nutrientsPer100g.carbs || 0) * factor),
    fat: round((nutrientsPer100g.fat || 0) * factor)
  };
}

function scalePerServing(nutrientsPerServing, servings) {
  if (!nutrientsPerServing || !Number.isFinite(servings) || servings <= 0) {
    return emptyMacros();
  }

  return {
    calories: round((nutrientsPerServing.calories || 0) * servings),
    protein: round((nutrientsPerServing.protein || 0) * servings),
    carbs: round((nutrientsPerServing.carbs || 0) * servings),
    fat: round((nutrientsPerServing.fat || 0) * servings)
  };
}

function sumMacros(items) {
  return items.reduce(
    (totals, item) => ({
      calories: round(totals.calories + Number(item.calories || 0)),
      protein: round(totals.protein + Number(item.protein || 0)),
      carbs: round(totals.carbs + Number(item.carbs || 0)),
      fat: round(totals.fat + Number(item.fat || 0))
    }),
    emptyMacros()
  );
}

function getServingWeightGrams(resolvedFood, ingredient) {
  return Number(
    ingredient?.servingWeightGrams ||
      resolvedFood?.metadata?.servingWeightGrams ||
      resolvedFood?.metadata?.gramsPerServing ||
      resolvedFood?.metadata?.cupWeightGrams ||
      0
  );
}

function getIngredientInputWeightGrams(ingredient) {
  return Number(ingredient?.rawWeightGrams || ingredient?.grams || 0);
}

function classifyRecipeType(food, recipeComposition) {
  const haystack = [
    food?.description,
    food?.metadata?.mealType,
    food?.metadata?.cuisine,
    food?.metadata?.tags,
    recipeComposition?.recipeType
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(soup|rasam|broth)/.test(haystack)) {
    return "soup";
  }
  if (/(dal|dhal|sambar|sambhar)/.test(haystack)) {
    return "dal";
  }
  if (/(curry|korma|kurma|stew|masala gravy)/.test(haystack)) {
    return "curry";
  }
  if (/(rice|khichdi|biryani|pulao|upma)/.test(haystack)) {
    return "grain";
  }
  if (/(salad|chaat|bowl)/.test(haystack)) {
    return "salad";
  }
  return "general";
}

function estimateYieldGrams(recipeType, ingredientInputWeightSum, servingWeightGrams, servingsCountHint) {
  if (Number.isFinite(servingWeightGrams) && servingWeightGrams > 0 && Number.isFinite(servingsCountHint) && servingsCountHint > 0) {
    return round(servingWeightGrams * servingsCountHint);
  }

  if (!Number.isFinite(ingredientInputWeightSum) || ingredientInputWeightSum <= 0) {
    return 0;
  }

  switch (recipeType) {
    case "soup":
    case "dal":
      return round(Math.max(ingredientInputWeightSum * 1.8, ingredientInputWeightSum + 250));
    case "curry":
      return round(Math.max(ingredientInputWeightSum * 1.35, ingredientInputWeightSum + 120));
    case "grain":
      return round(Math.max(ingredientInputWeightSum * 1.55, ingredientInputWeightSum + 150));
    case "salad":
      return round(Math.max(ingredientInputWeightSum * 0.95, ingredientInputWeightSum));
    default:
      return round(ingredientInputWeightSum);
  }
}

function buildYieldContext(food, recipeComposition, ingredientBreakdown) {
  const recipeType = classifyRecipeType(food, recipeComposition);
  const explicitYieldGrams = Number(recipeComposition?.totalYieldGrams || 0);
  const servingWeightGrams = Number(recipeComposition?.servingWeightGrams || 0);
  const servingsCountHint = Number(recipeComposition?.servingsCount || 0);
  const ingredientInputWeightSum = round(
    ingredientBreakdown.reduce((sum, ingredient) => sum + Number(ingredient.inputWeightGrams || 0), 0)
  );
  const estimatedYieldGrams = estimateYieldGrams(recipeType, ingredientInputWeightSum, servingWeightGrams, servingsCountHint);

  let totalYieldGrams = explicitYieldGrams;
  let yieldSource = recipeComposition?.yieldSource || null;

  if (!(Number.isFinite(totalYieldGrams) && totalYieldGrams > 0) && Number.isFinite(servingWeightGrams) && servingWeightGrams > 0 && Number.isFinite(servingsCountHint) && servingsCountHint > 0) {
    totalYieldGrams = round(servingWeightGrams * servingsCountHint);
    yieldSource = yieldSource || "inferred_from_servings";
  }

  if (!(Number.isFinite(totalYieldGrams) && totalYieldGrams > 0) && estimatedYieldGrams > 0) {
    totalYieldGrams = estimatedYieldGrams;
    yieldSource = yieldSource || "defaulted";
  }

  if (!yieldSource && Number.isFinite(explicitYieldGrams) && explicitYieldGrams > 0) {
    yieldSource = "estimated";
  }

  return {
    recipeType,
    totalYieldGrams: round(totalYieldGrams),
    servingWeightGrams: round(servingWeightGrams),
    ingredientInputWeightSum,
    estimatedYieldGrams,
    yieldSource: yieldSource || "defaulted"
  };
}

function buildContribution(resolvedFood, ingredient) {
  if (!resolvedFood) {
    return {
      resolved: false,
      nutrients: emptyMacros(),
      warning: "Ingredient source could not be resolved."
    };
  }

  const inputWeightGrams = getIngredientInputWeightGrams(ingredient);
  const servings = Number(ingredient?.servings || 0);
  if (resolvedFood.basis === "per_serving") {
    const explicitServings = Number.isFinite(servings) && servings > 0 ? servings : null;
    const servingWeightGrams = getServingWeightGrams(resolvedFood, ingredient);
    const derivedServings =
      explicitServings ||
      (Number.isFinite(inputWeightGrams) && inputWeightGrams > 0 && servingWeightGrams > 0
        ? inputWeightGrams / servingWeightGrams
        : null);

    if (!derivedServings) {
      return {
        resolved: false,
        nutrients: emptyMacros(),
        warning: "Per-serving ingredient is missing servings or serving weight."
      };
    }

    return {
      resolved: true,
      nutrients: scalePerServing(resolvedFood.nutrientsPer100g, derivedServings),
      servingsUsed: round(derivedServings),
      basis: "per_serving",
      sourceServingWeightGrams: servingWeightGrams > 0 ? round(servingWeightGrams) : null
    };
  }

  if (!Number.isFinite(inputWeightGrams) || inputWeightGrams <= 0) {
    return {
      resolved: false,
      nutrients: emptyMacros(),
      warning: "Per-100g ingredient is missing grams."
    };
  }

  return {
    resolved: true,
    nutrients: scalePer100g(resolvedFood.nutrientsPer100g, inputWeightGrams),
    basis: "per_100g"
  };
}

function buildRecipeTotals(totalMacros, totalYieldGrams) {
  return {
    weight_g: round(totalYieldGrams),
    calories: round(totalMacros.calories),
    protein: round(totalMacros.protein),
    carbs: round(totalMacros.carbs),
    fat: round(totalMacros.fat)
  };
}

function inferNutritionConfidence(yieldContext, ingredientBreakdown, validation) {
  const unresolvedCount = ingredientBreakdown.filter((item) => !item.resolved).length;
  if (validation.errors.length > 0 || unresolvedCount > 0) {
    return "low";
  }
  if (yieldContext.yieldSource === "defaulted") {
    return "low";
  }
  if (validation.warnings.length > 0 || yieldContext.yieldSource === "inferred_from_servings") {
    return "medium";
  }
  return "high";
}

function validateRecipeComposition(food, recipeComposition, ingredientBreakdown, yieldContext, composedPer100g) {
  const warnings = [];
  const errors = [];
  const totalYieldGrams = Number(yieldContext?.totalYieldGrams || 0);
  const servingWeightGrams = Number(yieldContext?.servingWeightGrams || 0);
  const ingredientInputWeightSum = Number(yieldContext?.ingredientInputWeightSum || 0);
  const recipeType = yieldContext?.recipeType || "general";
  const estimatedYieldGrams = Number(yieldContext?.estimatedYieldGrams || 0);

  if (!Number.isFinite(totalYieldGrams) || totalYieldGrams <= 0) {
    errors.push("Total yield grams must be a positive number.");
  }
  if (!Number.isFinite(servingWeightGrams) || servingWeightGrams <= 0) {
    errors.push("Serving weight grams must be a positive number.");
  }
  if (Number.isFinite(totalYieldGrams) && Number.isFinite(servingWeightGrams) && servingWeightGrams > totalYieldGrams) {
    errors.push("Serving weight cannot exceed total yield.");
  }

  if (ingredientInputWeightSum <= 0) {
    errors.push("Ingredient input weight sum must be positive.");
  } else if (totalYieldGrams > 0) {
    const deltaRatio = Math.abs(ingredientInputWeightSum - totalYieldGrams) / totalYieldGrams;
    if (deltaRatio > 0.35) {
      warnings.push("Ingredient input weights differ significantly from final cooked yield.");
    }

    if (/(soup|dal|curry|grain)/.test(recipeType) && totalYieldGrams < ingredientInputWeightSum * 0.98) {
      warnings.push("Cooked yield looks low for this dish type; soups, dals, curries, and rice dishes usually finish heavier than raw input.");
    }

    if (estimatedYieldGrams > 0 && recipeComposition?.yieldSource && Math.abs(totalYieldGrams - estimatedYieldGrams) / estimatedYieldGrams > 0.45) {
      warnings.push("Reported cooked yield differs sharply from the dish-type estimate. Double-check final cooked weight.");
    }
  }

  const unresolvedCount = ingredientBreakdown.filter((item) => !item.resolved).length;
  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} ingredient source(s) are unresolved or basis-incomplete.`);
  }

  if (composedPer100g && food?.nutrientsPer100g) {
    for (const macro of ["calories", "protein", "carbs", "fat"]) {
      const previousValue = Number(food.nutrientsPer100g[macro] || 0);
      const nextValue = Number(composedPer100g[macro] || 0);
      if (previousValue > 0) {
        const deltaRatio = Math.abs(nextValue - previousValue) / previousValue;
        if (deltaRatio > 0.4) {
          warnings.push(`${macro} differs by more than 40% from the previous reviewed value.`);
        }
      }
    }
  }

  return {
    errors,
    warnings,
    ingredientInputWeightSum: round(ingredientInputWeightSum)
  };
}

function buildCompositionStatus(recipeComposition, ingredientBreakdown, validation) {
  if (!recipeComposition) {
    return "no_recipe_composition";
  }
  if (validation.errors.length > 0) {
    return "invalid_recipe_composition";
  }
  if (ingredientBreakdown.some((item) => !item.resolved)) {
    return "incomplete_recipe_composition";
  }
  if (validation.warnings.length > 0) {
    return "verified_recipe_composition_with_warnings";
  }
  return "verified_recipe_composition";
}

function buildCacheKey(food) {
  return JSON.stringify({
    id: food?.id,
    version: food?.metadata?.catalogVersion || 1,
    recipeComposition: food?.metadata?.recipeComposition || null
  });
}

async function composeReviewedCatalogFood(food, resolveFoodRef) {
  const recipeComposition = food?.metadata?.recipeComposition;
  if (!recipeComposition || !Array.isArray(recipeComposition.ingredients) || recipeComposition.ingredients.length === 0) {
    return {
      food,
      composition: null
    };
  }

  const cacheKey = buildCacheKey(food);
  if (compositionCache.has(cacheKey)) {
    return compositionCache.get(cacheKey);
  }

  const ingredientBreakdown = [];

  for (const ingredient of recipeComposition.ingredients) {
    const resolvedFood = ingredient?.foodRef ? await resolveFoodRef(ingredient.foodRef) : null;
    const contribution = buildContribution(resolvedFood, ingredient);
    const inputWeightGrams = getIngredientInputWeightGrams(ingredient);

    ingredientBreakdown.push({
      id: ingredient?.id || ingredient?.foodRef?.id || null,
      label: ingredient?.label || resolvedFood?.description || "Unknown ingredient",
      grams: inputWeightGrams,
      rawWeightGrams: inputWeightGrams,
      inputWeightGrams,
      servings: Number(ingredient?.servings || 0) || null,
      resolved: contribution.resolved,
      warning: contribution.warning || null,
      foodRef: ingredient?.foodRef || null,
      sourceDescription: resolvedFood?.description || null,
      sourceType: resolvedFood?.source || null,
      basis: contribution.basis || resolvedFood?.basis || null,
      sourceServingWeightGrams: contribution.sourceServingWeightGrams || null,
      nutrients: contribution.nutrients
    });
  }

  const yieldContext = buildYieldContext(food, recipeComposition, ingredientBreakdown);
  const totalMacros = sumMacros(ingredientBreakdown.map((item) => item.nutrients));
  const recipeTotals = buildRecipeTotals(totalMacros, yieldContext.totalYieldGrams);
  const composedPer100g =
    yieldContext.totalYieldGrams > 0
      ? {
          calories: round((totalMacros.calories / yieldContext.totalYieldGrams) * 100),
          protein: round((totalMacros.protein / yieldContext.totalYieldGrams) * 100),
          carbs: round((totalMacros.carbs / yieldContext.totalYieldGrams) * 100),
          fat: round((totalMacros.fat / yieldContext.totalYieldGrams) * 100)
        }
      : null;
  const composedPerServing =
    yieldContext.totalYieldGrams > 0 && yieldContext.servingWeightGrams > 0
      ? {
          calories: round((totalMacros.calories / yieldContext.totalYieldGrams) * yieldContext.servingWeightGrams),
          protein: round((totalMacros.protein / yieldContext.totalYieldGrams) * yieldContext.servingWeightGrams),
          carbs: round((totalMacros.carbs / yieldContext.totalYieldGrams) * yieldContext.servingWeightGrams),
          fat: round((totalMacros.fat / yieldContext.totalYieldGrams) * yieldContext.servingWeightGrams)
        }
      : null;
  const validation = validateRecipeComposition(food, recipeComposition, ingredientBreakdown, yieldContext, composedPer100g);
  const compositionStatus = buildCompositionStatus(recipeComposition, ingredientBreakdown, validation);
  const nutritionConfidence = inferNutritionConfidence(yieldContext, ingredientBreakdown, validation);
  const servingsCount =
    yieldContext.totalYieldGrams > 0 && yieldContext.servingWeightGrams > 0
      ? round(yieldContext.totalYieldGrams / yieldContext.servingWeightGrams)
      : null;

  const result = {
    food: {
      ...food,
      nutrientsPer100g: composedPer100g || food.nutrientsPer100g,
      metadata: {
        ...(food.metadata || {}),
        provenance: {
          ...(food.metadata?.provenance || {}),
          nutritionMethod: composedPer100g ? "verified_recipe_composition" : food.metadata?.provenance?.nutritionMethod,
          nutritionTrustLevel:
            compositionStatus === "verified_recipe_composition"
              ? "composed_from_verified_ingredient_refs"
              : compositionStatus === "verified_recipe_composition_with_warnings"
                ? "composed_with_validation_warnings"
                : food.metadata?.provenance?.nutritionTrustLevel,
          sourceBackfillStatus: compositionStatus,
          missingExactSourceRefs: ingredientBreakdown.some((item) => !item.resolved)
        },
        review: {
          ...(food.metadata?.review || {}),
          sourceNote: composedPer100g
            ? `Computed from ${ingredientBreakdown.length} referenced ingredients in the reviewed recipe composer.`
            : food.metadata?.review?.sourceNote
        },
        recipeComposition: {
          ...recipeComposition,
          compositionStatus,
          ingredientCount: ingredientBreakdown.length,
          composedPerServing,
          recipeTotals,
          yieldSource: yieldContext.yieldSource,
          nutritionConfidence,
          servingsCount,
          validation
        }
      }
    },
    composition: {
      compositionStatus,
      recipeType: yieldContext.recipeType,
      totalWeightGrams: yieldContext.totalYieldGrams,
      servingWeightGrams: yieldContext.servingWeightGrams,
      recipeTotals,
      totalMacros,
      composedPer100g,
      composedPerServing,
      servingsCount,
      yieldSource: yieldContext.yieldSource,
      nutritionConfidence,
      ingredientBreakdown,
      validation
    }
  };

  compositionCache.set(cacheKey, result);
  return result;
}

module.exports = {
  composeReviewedCatalogFood
};
