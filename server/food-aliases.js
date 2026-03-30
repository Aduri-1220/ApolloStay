function normalizeFoodSearchQuery(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_GROUPS = [
  ["curd", "yogurt", "dahi"],
  ["chapati", "roti", "phulka"],
  ["chaas", "buttermilk"],
  ["poori", "puri"],
  ["khichdi", "khichri"],
  ["sambar", "sambhar"],
  ["paneer bhurji", "paneer scramble"],
  ["sprouts", "sprout salad", "sprout chaat"],
  ["makhana", "fox nuts"],
  ["lassi", "yogurt drink"],
  ["moong chilla", "moong dal chilla", "pesarattu"],
  ["oats", "oatmeal"],
  ["omelette", "omelet"],
  ["rajma chawal", "rajma rice"],
  ["palak paneer", "spinach paneer"],
  ["curd rice", "yogurt rice"],
  ["upma", "uppittu"],
  ["poha", "aval upma"]
];

function expandFoodSearchQueries(query) {
  const normalized = normalizeFoodSearchQuery(query);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);

  for (const group of ALIAS_GROUPS) {
    const matched = group.find((term) => normalized.includes(term));
    if (!matched) {
      continue;
    }

    for (const alias of group) {
      variants.add(normalized.replace(matched, alias));
      variants.add(alias);
    }
  }

  return Array.from(variants).slice(0, 8);
}

module.exports = {
  normalizeFoodSearchQuery,
  expandFoodSearchQueries
};
