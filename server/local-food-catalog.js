const RAW_CURATED_FOODS = [
  {
    id: "catalog-breakfast-moong-chilla",
    description: "Moong dal chilla with mint chutney",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "indian, vegetarian",
      tags: "high protein, low glycemic, savory",
      servingsPerPiece: 0.5,
      recipeComposition: {
        totalYieldGrams: 220,
        servingWeightGrams: 220,
        ingredients: [
          {
            id: "whole-moong",
            label: "Whole moong",
            grams: 110,
            foodRef: { fdcId: "indian-nutrition:142", source: "indian-nutrition" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 35,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 45,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 30,
            foodRef: { fdcId: "1999633", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 240, protein: 14, carbs: 26, fat: 8 }
  },
  {
    id: "catalog-breakfast-paneer-bhurji",
    description: "Paneer bhurji with one phulka",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "indian, vegetarian",
      tags: "high protein, iron supportive, savory",
      recipeComposition: {
        totalYieldGrams: 255,
        servingWeightGrams: 255,
        ingredients: [
          {
            id: "paneer-bhurji",
            label: "Paneer bhurji",
            grams: 185,
            servings: 1,
            servingWeightGrams: 185,
            foodRef: { fdcId: "indian-meals:967", source: "indian-meals" }
          },
          {
            id: "whole-wheat-flour",
            label: "Whole wheat flour",
            grams: 50,
            foodRef: { fdcId: "790085", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 20,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 310, protein: 18, carbs: 20, fat: 16 }
  },
  {
    id: "catalog-breakfast-oats-upma",
    description: "Vegetable oats upma",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "indian, vegetarian",
      tags: "quick, light, lower sodium",
      recipeComposition: {
        totalYieldGrams: 265,
        servingWeightGrams: 265,
        ingredients: [
          {
            id: "rolled-oats",
            label: "Rolled oats",
            grams: 80,
            foodRef: { fdcId: "2346396", source: "usda" }
          },
          {
            id: "carrot",
            label: "Carrot",
            grams: 40,
            foodRef: { fdcId: "2258586", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 35,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 60,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "milk",
            label: "Low-fat milk",
            grams: 50,
            foodRef: { fdcId: "746772", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 220, protein: 8, carbs: 34, fat: 6 }
  },
  {
    id: "catalog-breakfast-millet-idli",
    description: "Millet idli with sambar",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "south indian, vegetarian",
      tags: "light, lower glycemic",
      recipeComposition: {
        totalYieldGrams: 260,
        servingWeightGrams: 260,
        ingredients: [
          {
            id: "millet",
            label: "Millet",
            grams: 85,
            foodRef: { fdcId: "2512379", source: "usda" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 95,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "yogurt",
            label: "Plain yogurt",
            grams: 60,
            foodRef: { fdcId: "2259793", source: "usda" }
          },
          {
            id: "semolina",
            label: "Semolina",
            grams: 20,
            foodRef: { fdcId: "2003588", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 260, protein: 10, carbs: 44, fat: 5 }
  },
  {
    id: "catalog-breakfast-egg-omelette",
    description: "Masala omelette with sauteed vegetables",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "indian",
      tags: "high protein, quick, low sugar",
      recipeComposition: {
        totalYieldGrams: 210,
        servingWeightGrams: 210,
        ingredients: [
          {
            id: "egg",
            label: "Whole egg",
            grams: 110,
            foodRef: { fdcId: "323604", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 35,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 40,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 25,
            foodRef: { fdcId: "1999633", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 250, protein: 17, carbs: 8, fat: 16 }
  },
  {
    id: "catalog-breakfast-sprouts-bowl",
    description: "Sprouts chaat breakfast bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "indian, vegetarian",
      tags: "iron supportive, low glycemic, light",
      recipeComposition: {
        totalYieldGrams: 205,
        servingWeightGrams: 205,
        ingredients: [
          {
            id: "green-gram-sundal",
            label: "Green gram sundal",
            grams: 120,
            foodRef: { fdcId: "indian-meals:690", source: "indian-meals" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 35,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 30,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 20,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 210, protein: 12, carbs: 28, fat: 5 }
  },
  {
    id: "catalog-lunch-rajma-rice",
    description: "Rajma chawal with cucumber salad",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "north indian, vegetarian",
      tags: "iron supportive, hearty",
      recipeComposition: {
        totalYieldGrams: 350,
        servingWeightGrams: 350,
        ingredients: [
          {
            id: "rajma-curry",
            label: "Kidney bean curry",
            grams: 180,
            foodRef: { fdcId: "indian-nutrition:151", source: "indian-nutrition" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 140,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 30,
            foodRef: { fdcId: "2346406", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 420, protein: 17, carbs: 62, fat: 10 }
  },
  {
    id: "catalog-lunch-dal-roti",
    description: "Palak dal with 2 phulkas",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "indian, vegetarian",
      tags: "iron supportive, lower sodium",
      recipeComposition: {
        totalYieldGrams: 260,
        servingWeightGrams: 260,
        ingredients: [
          {
            id: "lentils",
            label: "Lentils",
            grams: 70,
            foodRef: { fdcId: "2644283", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 60,
            foodRef: { fdcId: "1999633", source: "usda" }
          },
          {
            id: "whole-wheat-flour",
            label: "Whole wheat flour",
            grams: 80,
            foodRef: { fdcId: "790085", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 25,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 25,
            foodRef: { fdcId: "1999634", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 380, protein: 18, carbs: 48, fat: 11 }
  },
  {
    id: "catalog-lunch-paneer-salad",
    description: "Paneer tikka salad bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "indian, vegetarian",
      tags: "high protein, low glycemic",
      recipeComposition: {
        totalYieldGrams: 235,
        servingWeightGrams: 235,
        ingredients: [
          {
            id: "cottage-cheese",
            label: "Cottage cheese",
            grams: 110,
            foodRef: { fdcId: "2346384", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 45,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 40,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 40,
            foodRef: { fdcId: "1999633", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 330, protein: 22, carbs: 18, fat: 17 }
  },
  {
    id: "catalog-lunch-chicken-rice",
    description: "Home-style chicken curry with red rice",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "indian",
      tags: "high protein, balanced",
      recipeComposition: {
        totalYieldGrams: 335,
        servingWeightGrams: 335,
        ingredients: [
          {
            id: "chicken-breast",
            label: "Chicken breast",
            grams: 140,
            foodRef: { fdcId: "2646170", source: "usda" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 130,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 30,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 35,
            foodRef: { fdcId: "1999634", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 440, protein: 28, carbs: 38, fat: 18 }
  },
  {
    id: "catalog-lunch-tofu-bowl",
    description: "Tofu millet vegetable bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "vegetarian, healthy",
      tags: "high protein, low glycemic, light",
      recipeComposition: {
        totalYieldGrams: 320,
        servingWeightGrams: 320,
        ingredients: [
          {
            id: "tofu-stir-fry",
            label: "Vegetable tofu stir fry",
            grams: 200,
            servings: 1,
            servingWeightGrams: 200,
            foodRef: { fdcId: "indian-meals:816", source: "indian-meals" }
          },
          {
            id: "millet",
            label: "Millet",
            grams: 85,
            foodRef: { fdcId: "2512379", source: "usda" }
          },
          {
            id: "carrot",
            label: "Carrot",
            grams: 35,
            foodRef: { fdcId: "2258586", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 360, protein: 20, carbs: 34, fat: 14 }
  },
  {
    id: "catalog-lunch-sambar-rice",
    description: "Sambar rice with beans poriyal",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "south indian, vegetarian",
      tags: "comfort meal, fiber rich",
      recipeComposition: {
        totalYieldGrams: 320,
        servingWeightGrams: 320,
        ingredients: [
          {
            id: "sambar",
            label: "Sambar",
            grams: 170,
            foodRef: { fdcId: "indian-nutrition:152", source: "indian-nutrition" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 130,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "snap-beans",
            label: "Green beans",
            grams: 20,
            foodRef: { fdcId: "321611", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 390, protein: 13, carbs: 58, fat: 10 }
  },
  {
    id: "catalog-dinner-khichdi",
    description: "Millet khichdi with curd",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "indian, vegetarian",
      tags: "light, gentle, kidney friendly",
      recipeComposition: {
        totalYieldGrams: 295,
        servingWeightGrams: 295,
        ingredients: [
          {
            id: "millet",
            label: "Millet",
            grams: 70,
            foodRef: { fdcId: "2512379", source: "usda" }
          },
          {
            id: "lentils",
            label: "Lentils",
            grams: 65,
            foodRef: { fdcId: "2644283", source: "usda" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 95,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "yogurt",
            label: "Plain yogurt",
            grams: 65,
            foodRef: { fdcId: "2259793", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 300, protein: 11, carbs: 44, fat: 8 }
  },
  {
    id: "catalog-dinner-paneer-stew",
    description: "Paneer and vegetable stew",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "indian, vegetarian",
      tags: "high protein, light",
      recipeComposition: {
        totalYieldGrams: 285,
        servingWeightGrams: 285,
        ingredients: [
          {
            id: "vegetable-stew",
            label: "Vegetable stew",
            grams: 180,
            servings: 1,
            servingWeightGrams: 180,
            foodRef: { fdcId: "indian-meals:408", source: "indian-meals" }
          },
          {
            id: "cottage-cheese",
            label: "Cottage cheese",
            grams: 75,
            foodRef: { fdcId: "2346384", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 30,
            foodRef: { fdcId: "1999633", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 290, protein: 19, carbs: 16, fat: 15 }
  },
  {
    id: "catalog-dinner-egg-curry",
    description: "Egg curry with one phulka",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "indian",
      tags: "high protein, iron supportive",
      recipeComposition: {
        totalYieldGrams: 265,
        servingWeightGrams: 265,
        ingredients: [
          {
            id: "egg-curry",
            label: "Egg curry",
            grams: 185,
            foodRef: { fdcId: "indian-nutrition:557", source: "indian-nutrition" }
          },
          {
            id: "whole-wheat-flour",
            label: "Whole wheat flour",
            grams: 55,
            foodRef: { fdcId: "790085", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 25,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 320, protein: 20, carbs: 18, fat: 17 }
  },
  {
    id: "catalog-dinner-fish-curry",
    description: "Grilled fish curry plate",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "indian",
      tags: "heart healthy, high protein",
      recipeComposition: {
        totalYieldGrams: 255,
        servingWeightGrams: 255,
        ingredients: [
          {
            id: "salmon",
            label: "Salmon",
            grams: 140,
            foodRef: { fdcId: "2684440", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 55,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 35,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 25,
            foodRef: { fdcId: "1999633", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 340, protein: 27, carbs: 20, fat: 14 }
  },
  {
    id: "catalog-dinner-soup-salad",
    description: "Lentil soup with vegetable salad",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "healthy, vegetarian",
      tags: "light, lower sodium",
      recipeComposition: {
        totalYieldGrams: 300,
        servingWeightGrams: 300,
        ingredients: [
          {
            id: "lentils",
            label: "Lentils",
            grams: 75,
            foodRef: { fdcId: "2644283", source: "usda" }
          },
          {
            id: "carrot",
            label: "Carrot",
            grams: 55,
            foodRef: { fdcId: "2258586", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 60,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 60,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 50,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 240, protein: 12, carbs: 30, fat: 7 }
  },
  {
    id: "catalog-snack-makhana",
    description: "Roasted makhana trail mix",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "indian, vegetarian",
      tags: "light, quick"
    },
    nutrientsPer100g: { calories: 170, protein: 6, carbs: 18, fat: 8 }
  },
  {
    id: "catalog-snack-chana",
    description: "Roasted chana and cucumber snack cup",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "indian, vegetarian",
      tags: "high protein, low glycemic",
      recipeComposition: {
        totalYieldGrams: 190,
        servingWeightGrams: 190,
        ingredients: [
          {
            id: "chickpeas",
            label: "Chickpeas",
            grams: 95,
            foodRef: { fdcId: "2644282", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 45,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 30,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 20,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 180, protein: 9, carbs: 24, fat: 5 }
  },
  {
    id: "catalog-snack-yogurt-bowl",
    description: "Greek yogurt seed bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "healthy, vegetarian",
      tags: "high protein, light",
      recipeComposition: {
        totalYieldGrams: 222,
        servingWeightGrams: 222,
        ingredients: [
          {
            id: "greek-yogurt",
            label: "Greek yogurt",
            grams: 170,
            foodRef: { fdcId: "330137", source: "usda" }
          },
          {
            id: "chia-seeds",
            label: "Chia seeds",
            grams: 12,
            foodRef: { fdcId: "2710819", source: "usda" }
          },
          {
            id: "flaxseed",
            label: "Ground flaxseed",
            grams: 10,
            foodRef: { fdcId: "2262075", source: "usda" }
          },
          {
            id: "rolled-oats",
            label: "Rolled oats",
            grams: 30,
            foodRef: { fdcId: "2346396", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 190, protein: 13, carbs: 14, fat: 8 }
  },
  {
    id: "catalog-snack-hummus",
    description: "Hummus with vegetable sticks",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "healthy, vegetarian",
      tags: "light, heart healthy",
      recipeComposition: {
        totalYieldGrams: 210,
        servingWeightGrams: 210,
        ingredients: [
          {
            id: "chickpeas",
            label: "Chickpeas",
            grams: 110,
            foodRef: { fdcId: "2644282", source: "usda" }
          },
          {
            id: "carrot",
            label: "Carrot",
            grams: 40,
            foodRef: { fdcId: "2258586", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 40,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 20,
            foodRef: { fdcId: "1999634", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 200, protein: 7, carbs: 20, fat: 9 }
  },
  {
    id: "catalog-snack-corn-chaat",
    description: "Sweet corn chaat",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "indian, vegetarian",
      tags: "quick, fiber rich",
      recipeComposition: {
        totalYieldGrams: 210,
        servingWeightGrams: 210,
        ingredients: [
          {
            id: "sweet-corn",
            label: "Sweet corn",
            grams: 110,
            foodRef: { fdcId: "2710826", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 35,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 25,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 40,
            foodRef: { fdcId: "2346406", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: 160, protein: 5, carbs: 26, fat: 4 }
  },
  {
    id: "catalog-breakfast-yogurt-oats-fruit",
    description: "Greek yogurt oats fruit bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "healthy, vegetarian",
      tags: "high protein, quick, light",
      recipeComposition: {
        totalYieldGrams: 255,
        servingWeightGrams: 255,
        ingredients: [
          {
            id: "greek-yogurt",
            label: "Greek yogurt",
            grams: 150,
            foodRef: { fdcId: "330137", source: "usda" }
          },
          {
            id: "rolled-oats",
            label: "Rolled oats",
            grams: 45,
            foodRef: { fdcId: "2346396", source: "usda" }
          },
          {
            id: "apple",
            label: "Apple",
            grams: 60,
            foodRef: { fdcId: "2346408", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-breakfast-paneer-oats-scramble",
    description: "Paneer oats scramble",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "indian, vegetarian",
      tags: "high protein, savory, quick",
      recipeComposition: {
        totalYieldGrams: 245,
        servingWeightGrams: 245,
        ingredients: [
          {
            id: "cottage-cheese",
            label: "Paneer",
            grams: 100,
            foodRef: { fdcId: "2346384", source: "usda" }
          },
          {
            id: "rolled-oats",
            label: "Rolled oats",
            grams: 55,
            foodRef: { fdcId: "2346396", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 35,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 35,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 20,
            foodRef: { fdcId: "1999633", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-breakfast-tomato-egg-toast",
    description: "Tomato egg toast plate",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "healthy",
      tags: "high protein, egg friendly, quick",
      recipeComposition: {
        totalYieldGrams: 230,
        servingWeightGrams: 230,
        ingredients: [
          {
            id: "egg",
            label: "Whole egg",
            grams: 100,
            foodRef: { fdcId: "323604", source: "usda" }
          },
          {
            id: "whole-wheat-flour",
            label: "Whole wheat bread equivalent",
            grams: 55,
            foodRef: { fdcId: "790085", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 45,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 30,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-breakfast-chickpea-upma",
    description: "Chickpea vegetable breakfast upma",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "breakfast",
      cuisine: "indian, vegetarian",
      tags: "fiber rich, iron supportive, savory",
      recipeComposition: {
        totalYieldGrams: 260,
        servingWeightGrams: 260,
        ingredients: [
          {
            id: "chickpeas",
            label: "Chickpeas",
            grams: 90,
            foodRef: { fdcId: "2644282", source: "usda" }
          },
          {
            id: "semolina",
            label: "Semolina",
            grams: 55,
            foodRef: { fdcId: "2003588", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 35,
            foodRef: { fdcId: "790646", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 35,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "carrot",
            label: "Carrot",
            grams: 45,
            foodRef: { fdcId: "2258586", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-lunch-chole-rice-bowl",
    description: "Chole rice bowl with cucumber",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "north indian, vegetarian",
      tags: "fiber rich, iron supportive, hearty",
      recipeComposition: {
        totalYieldGrams: 335,
        servingWeightGrams: 335,
        ingredients: [
          {
            id: "chickpeas",
            label: "Chickpeas",
            grams: 150,
            foodRef: { fdcId: "2644282", source: "usda" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 145,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 20,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 20,
            foodRef: { fdcId: "2346406", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-lunch-paneer-millet-bowl",
    description: "Paneer millet lunch bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "indian, vegetarian",
      tags: "high protein, low glycemic, balanced",
      recipeComposition: {
        totalYieldGrams: 320,
        servingWeightGrams: 320,
        ingredients: [
          {
            id: "cottage-cheese",
            label: "Paneer",
            grams: 110,
            foodRef: { fdcId: "2346384", source: "usda" }
          },
          {
            id: "millet",
            label: "Millet",
            grams: 95,
            foodRef: { fdcId: "2512379", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 45,
            foodRef: { fdcId: "1999633", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 40,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 30,
            foodRef: { fdcId: "2346406", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-lunch-lentil-salad-plate",
    description: "Lentil salad plate with yogurt",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "healthy, vegetarian",
      tags: "iron supportive, light, lower sodium",
      recipeComposition: {
        totalYieldGrams: 295,
        servingWeightGrams: 295,
        ingredients: [
          {
            id: "lentils",
            label: "Lentils",
            grams: 95,
            foodRef: { fdcId: "2644283", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 55,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 45,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 35,
            foodRef: { fdcId: "1999633", source: "usda" }
          },
          {
            id: "yogurt",
            label: "Plain yogurt",
            grams: 65,
            foodRef: { fdcId: "2259793", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-lunch-salmon-rice-bowl",
    description: "Salmon rice bowl with greens",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "lunch",
      cuisine: "healthy, non vegetarian",
      tags: "heart healthy, high protein, balanced",
      recipeComposition: {
        totalYieldGrams: 310,
        servingWeightGrams: 310,
        ingredients: [
          {
            id: "salmon",
            label: "Salmon",
            grams: 120,
            foodRef: { fdcId: "2684440", source: "usda" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 120,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 35,
            foodRef: { fdcId: "1999633", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 35,
            foodRef: { fdcId: "2346406", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-dinner-tofu-spinach-curry",
    description: "Tofu spinach curry bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "healthy, vegetarian",
      tags: "high protein, light, heart healthy",
      recipeComposition: {
        totalYieldGrams: 285,
        servingWeightGrams: 285,
        ingredients: [
          {
            id: "tofu-stir-fry",
            label: "Tofu base",
            grams: 180,
            servings: 0.9,
            servingWeightGrams: 200,
            foodRef: { fdcId: "indian-meals:816", source: "indian-meals" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 55,
            foodRef: { fdcId: "1999633", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 30,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 20,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-dinner-chicken-lentil-bowl",
    description: "Chicken lentil dinner bowl",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "healthy, non vegetarian",
      tags: "high protein, balanced, steady energy",
      recipeComposition: {
        totalYieldGrams: 305,
        servingWeightGrams: 305,
        ingredients: [
          {
            id: "chicken-breast",
            label: "Chicken breast",
            grams: 120,
            foodRef: { fdcId: "2646170", source: "usda" }
          },
          {
            id: "lentils",
            label: "Lentils",
            grams: 80,
            foodRef: { fdcId: "2644283", source: "usda" }
          },
          {
            id: "spinach",
            label: "Spinach",
            grams: 40,
            foodRef: { fdcId: "1999633", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 35,
            foodRef: { fdcId: "1999634", source: "usda" }
          },
          {
            id: "onion",
            label: "Onion",
            grams: 30,
            foodRef: { fdcId: "790646", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-dinner-yogurt-rice-plate",
    description: "Yogurt rice with cucumber and tomato",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "south indian, vegetarian",
      tags: "light, gentle, lower glycemic",
      recipeComposition: {
        totalYieldGrams: 290,
        servingWeightGrams: 290,
        ingredients: [
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 120,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "yogurt",
            label: "Plain yogurt",
            grams: 120,
            foodRef: { fdcId: "2259793", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 30,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 20,
            foodRef: { fdcId: "1999634", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-dinner-fish-rice-salad",
    description: "Fish rice salad plate",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "dinner",
      cuisine: "healthy, non vegetarian",
      tags: "heart healthy, high protein, light",
      recipeComposition: {
        totalYieldGrams: 300,
        servingWeightGrams: 300,
        ingredients: [
          {
            id: "salmon",
            label: "Salmon",
            grams: 110,
            foodRef: { fdcId: "2684440", source: "usda" }
          },
          {
            id: "boiled-rice",
            label: "Boiled rice",
            grams: 105,
            foodRef: { fdcId: "indian-nutrition:103", source: "indian-nutrition" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 45,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 40,
            foodRef: { fdcId: "1999634", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-snack-fruit-yogurt-cup",
    description: "Fruit yogurt cup",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "healthy, vegetarian",
      tags: "light, quick, high protein",
      recipeComposition: {
        totalYieldGrams: 185,
        servingWeightGrams: 185,
        ingredients: [
          {
            id: "greek-yogurt",
            label: "Greek yogurt",
            grams: 125,
            foodRef: { fdcId: "330137", source: "usda" }
          },
          {
            id: "apple",
            label: "Apple",
            grams: 60,
            foodRef: { fdcId: "2346408", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-snack-paneer-cucumber-cup",
    description: "Paneer cucumber snack cup",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "indian, vegetarian",
      tags: "high protein, low glycemic, quick",
      recipeComposition: {
        totalYieldGrams: 170,
        servingWeightGrams: 170,
        ingredients: [
          {
            id: "cottage-cheese",
            label: "Paneer",
            grams: 90,
            foodRef: { fdcId: "2346384", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 50,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 30,
            foodRef: { fdcId: "1999634", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-snack-oats-yogurt-cup",
    description: "Oats yogurt snack cup",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "healthy, vegetarian",
      tags: "steady energy, quick, light",
      recipeComposition: {
        totalYieldGrams: 175,
        servingWeightGrams: 175,
        ingredients: [
          {
            id: "yogurt",
            label: "Plain yogurt",
            grams: 105,
            foodRef: { fdcId: "2259793", source: "usda" }
          },
          {
            id: "rolled-oats",
            label: "Rolled oats",
            grams: 40,
            foodRef: { fdcId: "2346396", source: "usda" }
          },
          {
            id: "apple",
            label: "Apple",
            grams: 30,
            foodRef: { fdcId: "2346408", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  },
  {
    id: "catalog-snack-egg-salad-cup",
    description: "Egg salad snack cup",
    dataType: "curated_recipe",
    source: "catalog",
    basis: "per_serving",
    quantityUnit: "serving",
    metadata: {
      mealType: "snack",
      cuisine: "healthy",
      tags: "egg friendly, high protein, quick",
      recipeComposition: {
        totalYieldGrams: 165,
        servingWeightGrams: 165,
        ingredients: [
          {
            id: "egg",
            label: "Whole egg",
            grams: 90,
            foodRef: { fdcId: "323604", source: "usda" }
          },
          {
            id: "cucumber",
            label: "Cucumber",
            grams: 45,
            foodRef: { fdcId: "2346406", source: "usda" }
          },
          {
            id: "tomato",
            label: "Tomato",
            grams: 30,
            foodRef: { fdcId: "1999634", source: "usda" }
          }
        ]
      }
    },
    nutrientsPer100g: { calories: null, protein: null, carbs: null, fat: null }
  }
];

const { catalogOverridesPath } = require("./config");
const { expandFoodSearchQueries } = require("./food-aliases");
const { ensureStore, loadMealLogs, saveMealLogs } = require("./store");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (Array.isArray(override)) {
    return override;
  }
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    merged[key] = isPlainObject(value) ? deepMerge(base[key], value) : value;
  }
  return merged;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function deriveProvenance(food) {
  const text = normalize(food?.description);
  const sourceRefs = [
    {
      kind: "local_dataset",
      label: "USDA Foundation foods ingredient lookup",
      configuredPathEnv: "FOOD_CSV"
    },
    {
      kind: "local_dataset",
      label: "Indian nutrition dataset bundle",
      configuredPathEnv: "INDIAN_NUTRITION_ZIP"
    }
  ];

  let recipeStyle = "reviewed_recipe_pattern";
  if (/(idli|dosa|upma|poha|khichdi|sambar rice|rajma chawal|dal|phulka|roti)/.test(text)) {
    recipeStyle = "indian_home_style_plate";
  } else if (/(salad|bowl|soup)/.test(text)) {
    recipeStyle = "assembled_light_meal";
  } else if (/(omelette|egg curry|fish curry|chicken curry|paneer)/.test(text)) {
    recipeStyle = "protein_forward_recipe";
  }

  return {
    nutritionTrustLevel: "review_required_before_production_expansion",
    nutritionMethod: "reviewed_recipe_estimate",
    recipeStyle,
    sourceRefs,
    missingExactSourceRefs: true,
    sourceBackfillStatus: "needs_exact_recipe_source"
  };
}

function deriveSeedRecipeComposition(food) {
  return {
    totalYieldGrams: null,
    servingWeightGrams: null,
    ingredients: [],
    compositionStatus: "no_recipe_composition"
  };
}

function normalizeSeedRecipeComposition(recipeComposition) {
  if (!recipeComposition || !Array.isArray(recipeComposition.ingredients) || recipeComposition.ingredients.length === 0) {
    return deriveSeedRecipeComposition();
  }

  return {
    ...recipeComposition,
    compositionStatus: recipeComposition.compositionStatus || "seeded_recipe_composition",
    ingredientCount: Number(recipeComposition.ingredients.length || 0)
  };
}

function deriveAliases(description, metadata = {}) {
  const aliases = new Set(splitList(metadata.aliases));
  const normalizedDescription = normalize(description);

  if (/\bcurd\b/.test(normalizedDescription)) {
    aliases.add("dahi");
    aliases.add("yogurt");
  }
  if (/\byogurt\b/.test(normalizedDescription)) {
    aliases.add("curd");
    aliases.add("dahi");
  }
  if (/\bphulka\b/.test(normalizedDescription)) {
    aliases.add("roti");
    aliases.add("chapati");
  }
  if (/\broti\b/.test(normalizedDescription)) {
    aliases.add("chapati");
    aliases.add("phulka");
  }
  if (/\bkhichdi\b/.test(normalizedDescription)) {
    aliases.add("khichri");
  }
  if (/\bsambar\b/.test(normalizedDescription)) {
    aliases.add("sambhar");
  }
  if (/\bchaat\b/.test(normalizedDescription)) {
    aliases.add("chat");
  }

  return Array.from(aliases);
}

function buildReviewRecord(metadata = {}) {
  const existing = metadata.review || {};
  return {
    status: existing.status || "reviewed_internal",
    workflowStatus: existing.workflowStatus || "approved_seed",
    sourceType: existing.sourceType || "curated_internal",
    sourceNote:
      existing.sourceNote ||
      "Internal reviewed catalog entry. Nutrition values should trace back to verified source data or controlled recipe composition before expansion.",
    sourceQuality: existing.sourceQuality || "needs_external_source_note",
    reviewedAt: existing.reviewedAt || "2026-03-25",
    reviewer: existing.reviewer || "catalog-team",
    approvedAt: existing.approvedAt || existing.reviewedAt || "2026-03-25",
    approvedBy: existing.approvedBy || existing.reviewer || "catalog-team",
    lastEditedAt: existing.lastEditedAt || existing.reviewedAt || "2026-03-25",
    lastEditedBy: existing.lastEditedBy || existing.reviewer || "catalog-team"
  };
}

function createReviewedCatalogEntry(food) {
  const metadata = food.metadata || {};
  const cuisineTags = splitList(metadata.cuisine);
  const tagList = splitList(metadata.tags);
  const aliases = deriveAliases(food.description, metadata);
  const provenance = deriveProvenance(food);
  const recipeComposition = normalizeSeedRecipeComposition(metadata.recipeComposition || deriveSeedRecipeComposition(food));

  return {
    ...food,
    source: "reviewed_catalog",
    metadata: {
      ...metadata,
      cuisine: cuisineTags.join(", "),
      tags: tagList.join(", "),
      cuisineTags,
      tagList,
      aliases,
      catalogTier: metadata.catalogTier || "reviewed_seed",
      catalogVersion: Number(metadata.catalogVersion || 1),
      changeHistory: Array.isArray(metadata.changeHistory) ? metadata.changeHistory : [],
      review: {
        ...buildReviewRecord(metadata),
        sourceNote:
          metadata.review?.sourceNote ||
          `Reviewed catalog entry for ${food.description}. Current nutrition is treated as a reviewed recipe estimate and still needs exact per-item source backfill before broader production-scale expansion.`,
        sourceRefs: Array.isArray(metadata.review?.sourceRefs) ? metadata.review.sourceRefs : provenance.sourceRefs
      },
      provenance,
      recipeComposition
    }
  };
}

const CURATED_FOODS = RAW_CURATED_FOODS.map(createReviewedCatalogEntry);

function loadCatalogOverrides() {
  ensureStore(catalogOverridesPath);
  return loadMealLogs(catalogOverridesPath);
}

function saveCatalogOverrides(items) {
  saveMealLogs(catalogOverridesPath, items);
}

function getCuratedFoods() {
  const overrides = loadCatalogOverrides();
  const overrideMap = new Map(overrides.map((item) => [item.id, item]));
  return CURATED_FOODS.map((food) =>
    overrideMap.has(food.id) ? createReviewedCatalogEntry(deepMerge(food, overrideMap.get(food.id))) : food
  );
}

function matchesQuery(food, query) {
  const normalizedQueries = expandFoodSearchQueries(query);
  if (normalizedQueries.length === 0) {
    return true;
  }

  const haystack = normalize([
    food.description,
    food.dataType,
    food.source,
    food.metadata?.mealType,
    food.metadata?.cuisine,
    food.metadata?.tags,
    food.metadata?.cuisineTags,
    food.metadata?.tagList,
    food.metadata?.aliases,
    food.metadata?.review?.sourceType,
    food.metadata?.review?.sourceNote
  ].join(" "));

  return normalizedQueries.some((normalizedQuery) =>
    normalizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token))
  );
}

function searchCuratedFoods(query, limit = 12) {
  return getCuratedFoods()
    .filter((food) => matchesQuery(food, query))
    .slice(0, limit)
    .map((food) => ({
      fdcId: food.id,
      description: food.description,
      dataType: food.dataType,
      source: food.source,
      basis: food.basis,
      quantityUnit: food.quantityUnit,
      metadata: food.metadata
    }));
}

function loadCuratedFoodDetail(id) {
  const item = getCuratedFoods().find((food) => food.id === id);
  return item || null;
}

function toCatalogAuditItem(food) {
  return {
    id: food.id,
    description: food.description,
    mealType: food.metadata?.mealType || null,
    cuisine: food.metadata?.cuisineTags || [],
    tags: food.metadata?.tagList || [],
    source: food.source,
    nutritionTrustLevel: food.metadata?.provenance?.nutritionTrustLevel || null,
    nutritionMethod: food.metadata?.provenance?.nutritionMethod || null,
    sourceBackfillStatus: food.metadata?.provenance?.sourceBackfillStatus || null,
    missingExactSourceRefs: Boolean(food.metadata?.provenance?.missingExactSourceRefs),
    recipeCompositionStatus: food.metadata?.recipeComposition?.compositionStatus || "no_recipe_composition",
    recipeIngredientCount: Number(food.metadata?.recipeComposition?.ingredientCount || 0),
    sourceRefs: food.metadata?.review?.sourceRefs || [],
    sourceNote: food.metadata?.review?.sourceNote || "",
    catalogVersion: Number(food.metadata?.catalogVersion || 1),
    workflowStatus: food.metadata?.review?.workflowStatus || "approved_seed",
    approvedAt: food.metadata?.review?.approvedAt || null,
    approvedBy: food.metadata?.review?.approvedBy || null
  };
}

function listCuratedCatalogAudit(options = {}) {
  const {
    search = "",
    offset = 0,
    limit = 25,
    onlyNeedingBackfill = false
  } = options;
  const needle = normalize(search);
  const filtered = getCuratedFoods()
    .map(toCatalogAuditItem)
    .filter((food) => {
      if (onlyNeedingBackfill && !food.missingExactSourceRefs) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return normalize(
        [
          food.description,
          food.mealType,
          food.cuisine.join(" "),
          food.tags.join(" "),
          food.sourceNote
        ].join(" ")
      ).includes(needle);
    });

  return {
    totalCount: filtered.length,
    missingExactSourceRefsCount: filtered.filter((item) => item.missingExactSourceRefs).length,
    offset,
    limit,
    items: filtered.slice(offset, offset + limit)
  };
}

function updateCuratedCatalogEntry(id, input = {}, actorId = "catalog-admin") {
  const current = loadCuratedFoodDetail(id);
  if (!current) {
    return null;
  }

  const currentVersion = Number(current.metadata?.catalogVersion || 1);
  const nextVersion = currentVersion + 1;
  const nextReview = {
    ...(current.metadata?.review || {}),
    ...(input.review || {}),
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: actorId
  };

  if (input.approve === true) {
    nextReview.workflowStatus = "approved";
    nextReview.approvedAt = new Date().toISOString();
    nextReview.approvedBy = actorId;
  }

  const merged = createReviewedCatalogEntry(
    deepMerge(current, {
      ...input,
      metadata: {
        ...(input.metadata || {}),
        catalogVersion: nextVersion,
        review: nextReview,
        changeHistory: [
          ...(current.metadata?.changeHistory || []),
          {
            at: new Date().toISOString(),
            by: actorId,
            version: nextVersion,
            summary: String(input.changeSummary || "Catalog entry updated from admin review.").trim()
          }
        ]
      }
    })
  );

  const overrides = loadCatalogOverrides();
  const overrideWithoutCurrent = overrides.filter((item) => item.id !== id);
  overrideWithoutCurrent.push(merged);
  saveCatalogOverrides(overrideWithoutCurrent);
  return merged;
}

module.exports = {
  getCuratedFoods,
  searchCuratedFoods,
  loadCuratedFoodDetail,
  listCuratedCatalogAudit,
  updateCuratedCatalogEntry
};
