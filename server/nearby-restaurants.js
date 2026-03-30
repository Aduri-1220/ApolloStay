function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(fromLat, fromLon, toLat, toLon) {
  const earthRadius = 6371000;
  const latDelta = toRadians(toLat - fromLat);
  const lonDelta = toRadians(toLon - fromLon);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(lonDelta / 2) *
      Math.sin(lonDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

function splitCuisine(rawCuisine) {
  return String(rawCuisine || "")
    .split(/[;,]/)
    .map((value) => normalize(value.replace(/_/g, " ")))
    .filter(Boolean);
}

function inferSuggestedOrder(meal, cuisines) {
  const title = normalize(meal?.title);
  const cuisineBlob = cuisines.join(" ");

  if (/(idli|dosa|upma|poha|uttapam|pongal)/.test(title) || cuisineBlob.includes("south indian")) {
    return "Ask for plain idli, dosa, upma, or pongal with lighter chutney and moderate oil.";
  }
  if (/(paneer|dal|rajma|roti|thali|khichdi)/.test(title) || cuisineBlob.includes("indian")) {
    return "Look for dal, paneer, roti, or a lighter thali and ask for less oil and less salt.";
  }
  if (/(omelette|egg|oats|yogurt|sandwich)/.test(title) || cuisineBlob.includes("cafe")) {
    return "Choose the egg, oats, yogurt, or simpler sandwich-style option and skip sugary drinks.";
  }
  if (cuisineBlob.includes("healthy") || cuisineBlob.includes("salad")) {
    return "Pick the grilled, bowl, salad, or lean-protein option that matches your calorie target.";
  }
  if (normalize(meal?.mealType) === "snack") {
    return "Choose a smaller portion, ideally protein-forward or lightly cooked, and avoid fried add-ons.";
  }

  return `Ask for the closest match to ${meal?.title || "your planned meal"} and keep the serving moderate.`;
}

function buildAvoidNotes(avoidTerms, cuisines) {
  const notes = new Set();
  const cuisineBlob = cuisines.join(" ");

  if ((avoidTerms || []).some((term) => /sweet|sugar|dessert|juice/.test(term))) {
    notes.add("Avoid sweet drinks and dessert-heavy combos here.");
  }
  if ((avoidTerms || []).some((term) => /fried|butter|ghee/.test(term)) || /fried chicken|burger|pizza/.test(cuisineBlob)) {
    notes.add("Skip deep-fried sides and rich creamy add-ons.");
  }
  if ((avoidTerms || []).some((term) => /salt|sodium|pickle|instant/.test(term))) {
    notes.add("Ask for less salt and avoid pickles, packaged soups, or salty sides.");
  }
  if (/dessert|ice cream|bakery/.test(cuisineBlob)) {
    notes.add("This cuisine type can be harder to fit into a medical-aware plan.");
  }

  return Array.from(notes);
}

function scoreRestaurant({ place, meal, plan }) {
  const cuisines = splitCuisine(place.cuisine);
  const cuisineBlob = cuisines.join(" ");
  const mealBlob = normalize(`${meal?.title || ""} ${meal?.description || ""} ${meal?.whyItFits || ""}`);
  let score = 40;

  if (place.amenity === "restaurant") {
    score += 8;
  }
  if (place.amenity === "cafe") {
    score += normalize(meal?.mealType) === "breakfast" || normalize(meal?.mealType) === "snack" ? 7 : -2;
  }
  if (place.amenity === "fast_food") {
    score -= 14;
  }

  if (mealBlob.includes("vegetarian") && (cuisineBlob.includes("vegetarian") || cuisineBlob.includes("vegan"))) {
    score += 10;
  }
  if (mealBlob.includes("breakfast") || normalize(meal?.mealType) === "breakfast") {
    if (cuisineBlob.includes("south indian")) {
      score += 12;
    }
    if (cuisineBlob.includes("cafe")) {
      score += 5;
    }
  }
  if (/(paneer|dal|rajma|roti|thali|khichdi)/.test(mealBlob) && /(indian|north indian|vegetarian)/.test(cuisineBlob)) {
    score += 12;
  }
  if (/(omelette|egg|oats|yogurt|sandwich)/.test(mealBlob) && /(cafe|healthy|continental)/.test(cuisineBlob)) {
    score += 10;
  }
  if ((plan?.nutritionPriorities || []).includes("lower_glycemic_load")) {
    if (/(healthy|salad|grill|vegetarian|south indian)/.test(cuisineBlob)) {
      score += 7;
    }
    if (/(dessert|bakery|juice|pizza|burger)/.test(cuisineBlob)) {
      score -= 12;
    }
  }
  if ((plan?.nutritionPriorities || []).includes("lower_sodium")) {
    if (/(healthy|vegetarian|salad)/.test(cuisineBlob)) {
      score += 5;
    }
    if (/(fast food|fried chicken|pizza)/.test(cuisineBlob)) {
      score -= 8;
    }
  }
  if ((plan?.nutritionPriorities || []).includes("iron_supportive") && /(indian|healthy|vegetarian)/.test(cuisineBlob)) {
    score += 5;
  }
  if ((plan?.avoidTerms || []).some((term) => cuisineBlob.includes(term))) {
    score -= 12;
  }

  const distancePenalty = Math.min((place.distanceMeters || 0) / 200, 10);
  score -= distancePenalty;

  return Math.round(score);
}

async function fetchNearbyRestaurants({ latitude, longitude, radiusMeters = 2500 }) {
  const query = `
[out:json][timeout:25];
(
  node(around:${radiusMeters},${latitude},${longitude})["amenity"~"restaurant|cafe|fast_food"];
  way(around:${radiusMeters},${latitude},${longitude})["amenity"~"restaurant|cafe|fast_food"];
  relation(around:${radiusMeters},${latitude},${longitude})["amenity"~"restaurant|cafe|fast_food"];
);
out center tags 40;
`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain"
    },
    body: query
  });

  if (!response.ok) {
    throw new Error(`Nearby restaurant lookup failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];

  return elements
    .map((element) => {
      const tags = element.tags || {};
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);

      return {
        placeId: String(element.id),
        name: tags.name,
        amenity: tags.amenity || "restaurant",
        cuisine: tags.cuisine || "",
        address: addressParts.join(", ") || null,
        distanceMeters: distanceMeters(latitude, longitude, lat, lon)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

function rankNearbyRestaurants({ restaurants, meal, plan }) {
  return restaurants
    .map((place) => {
      const cuisines = splitCuisine(place.cuisine);
      const score = scoreRestaurant({ place, meal, plan });
      return {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        distanceMeters: place.distanceMeters,
        cuisines,
        amenity: place.amenity,
        score,
        bestFitReason: `Best fit for ${meal.mealType} because it aligns with ${meal.title.toLowerCase()} and your current priorities: ${
          (plan?.nutritionPriorities || []).slice(0, 3).join(", ") || "general balance"
        }.`,
        suggestedOrder: inferSuggestedOrder(meal, cuisines),
        avoidNotes: buildAvoidNotes(plan?.avoidTerms || [], cuisines)
      };
    })
    .sort((left, right) => right.score - left.score || left.distanceMeters - right.distanceMeters)
    .slice(0, 8);
}

module.exports = {
  fetchNearbyRestaurants,
  rankNearbyRestaurants
};
