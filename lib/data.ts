import {
  FoodSwap,
  MacroTarget,
  Meal,
  ProfileMetric,
  Trend,
  WorkoutPlanItem
} from "@/lib/types";

export const dashboardStats = [
  { label: "calories left", value: "420" },
  { label: "protein progress", value: "76%" },
  { label: "sleep readiness", value: "8.1/10" }
];

export const dailyMeals: Meal[] = [
  { name: "Greek yogurt bowl", time: "Breakfast • 8:10 AM", calories: 340, protein: 29, carbs: 31, fat: 10 },
  { name: "Paneer quinoa power bowl", time: "Lunch • 1:15 PM", calories: 510, protein: 34, carbs: 46, fat: 19 },
  { name: "Whey banana shake", time: "Snack • 5:30 PM", calories: 220, protein: 24, carbs: 22, fat: 4 }
];

export const todayCoachNote =
  "Your adherence is strongest when lunch carries at least 30g protein. Keep dinner lighter, and place your workout within two hours of your afternoon snack for better energy.";

export const macroTargets: MacroTarget[] = [
  { label: "Calories", value: "2,050 kcal", detail: "Moderate deficit tuned for fat loss without hurting training quality." },
  { label: "Protein", value: "132 g", detail: "Higher protein anchor to support recomposition and satiety." },
  { label: "Carbs", value: "210 g", detail: "Fuel allocated around strength sessions and step count." },
  { label: "Fat", value: "62 g", detail: "Balanced for hormones, taste, and adherence." }
];

export const waterProgress = { current: 1.75, goal: 2.8 };

export const suggestedSwaps: FoodSwap[] = [
  {
    current: "Masala dosa + extra chutney",
    better: "Plain dosa + sambar + boiled eggs",
    reason: "Keeps the breakfast familiar while lifting protein and reducing hidden oils."
  },
  {
    current: "Sweetened cold coffee",
    better: "Iced latte with no sugar + whey shot",
    reason: "Preserves routine and taste while cutting sugar spikes."
  },
  {
    current: "Late-night namkeen",
    better: "Roasted makhana + herbal tea",
    reason: "Less calorie drift and better sleep readiness."
  }
];

export const workoutPlan: WorkoutPlanItem[] = [
  {
    day: "Mon",
    title: "Lower body strength",
    duration: "45 min",
    description: "Squats, Romanian deadlifts, split squats, calf raises, and a short incline walk finisher."
  },
  {
    day: "Tue",
    title: "Mobility + steps",
    duration: "30 min",
    description: "Hips, shoulders, spine mobility and a 7k step target to improve recovery."
  },
  {
    day: "Wed",
    title: "Upper body push-pull",
    duration: "48 min",
    description: "Dumbbell press, rows, pulldowns, rear delts, curls, and triceps superset."
  },
  {
    day: "Fri",
    title: "Full-body metabolic session",
    duration: "35 min",
    description: "Kettlebell swings, sled pushes, assisted pull-ups, farmer carries, and core intervals."
  }
];

export const weeklyTrends: Trend[] = [
  {
    label: "Weight trend",
    value: "-0.6 kg",
    delta: "On target",
    positive: true,
    note: "Progress is steady without a sharp energy drop, which usually signals a sustainable deficit."
  },
  {
    label: "Protein consistency",
    value: "6 / 7 days",
    delta: "+2 days",
    positive: true,
    note: "Protein adherence is improving. Preserve breakfast structure because it creates the strongest ripple effect."
  },
  {
    label: "Evening overages",
    value: "2 events",
    delta: "-1 event",
    positive: true,
    note: "Late-night calories are trending down, likely because snacks are now planned before the workout window."
  }
];

export const retentionNarrative =
  "Users stay when the app explains tradeoffs instead of only counting calories. PulsePilot should coach behavior with context: what changed, why it matters, and the easiest next action.";

export const userMetrics: ProfileMetric[] = [
  { label: "Age", value: "26" },
  { label: "Height", value: "165 cm" },
  { label: "Weight", value: "68 kg" },
  { label: "Steps", value: "8.4k/day" }
];

export const settingsGroups = [
  {
    title: "Health profile",
    items: ["Goals and targets", "Dietary preferences", "Activity baseline", "Health conditions"]
  },
  {
    title: "Monetization",
    items: ["Premium plan", "Coach consult upsell", "Meal planner", "Enterprise wellness access"]
  },
  {
    title: "Connected future",
    items: ["Apple Health sync", "Google Fit sync", "Wearables", "Lab report upload"]
  }
];
