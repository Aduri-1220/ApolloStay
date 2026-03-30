import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Screen } from "@/components/Screen";
import { ErrorCard, LoadingCard } from "@/components/AsyncState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getProfile, updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { syncMealReminderSchedule } from "@/lib/notifications";
import { Profile } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

const genderOptions = ["Female", "Male", "Other"];
const activityOptions = ["Sedentary", "Lightly Active", "Moderately Active", "Very Active"];
const goalOptions = [
  { label: "Maintain", value: "maintain_weight" },
  { label: "Lose fat", value: "lose_weight" },
  { label: "Build muscle", value: "build_muscle" },
  { label: "Feel better", value: "improve_health" }
];
const dietaryOptions = [
  { label: "Vegetarian", value: "vegetarian" },
  { label: "Vegan", value: "vegan" },
  { label: "Non-veg", value: "non_vegetarian" },
  { label: "Eggitarian", value: "eggitarian" }
];
const likedFoodOptions = [
  "🍗 Chicken",
  "🍚 Rice",
  "🥚 Egg",
  "🍝 Pasta",
  "🍅 Tomato",
  "🥔 Potato",
  "🍌 Banana",
  "🥑 Avocado",
  "🐟 Fish",
  "🥦 Broccoli",
  "🥕 Carrot",
  "🥛 Milk",
  "🧀 Cheese",
  "🍞 Bread",
  "🍎 Apple",
  "🫘 Beans",
  "🥜 Nuts",
  "🥣 Oatmeal",
  "🫓 Roti",
  "🍛 Dal",
  "🧆 Paneer",
  "🥗 Salad",
  "🍊 Orange",
  "🍓 Strawberry"
];
const dislikedFoodOptions = [
  "🧅 Onion",
  "🫒 Olives",
  "🐟 Fish",
  "🍤 Seafood",
  "🍄 Mushrooms",
  "🥒 Pickles",
  "🌿 Cilantro",
  "🍆 Eggplant",
  "🫑 Peppers",
  "🌶️ Spicy food",
  "🥛 Dairy",
  "🌾 Gluten",
  "🧄 Garlic",
  "🥬 Celery",
  "🫒 Beets",
  "🧠 Liver",
  "🧀 Blue cheese",
  "🥥 Coconut",
  "🥬 Cabbage",
  "🥬 Brussels sprouts"
];
const mealsPerDayOptions = [
  { value: 2, title: "Two meals", detail: "Breakfast and dinner" },
  { value: 3, title: "Three meals", detail: "Breakfast, lunch and dinner" },
  { value: 4, title: "Four or more", detail: "Includes snacks" }
];
const stepCount = 4;

function calculateAge(dateOfBirth: string) {
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

function calculateBmi(weightKg: number, heightCm: number) {
  if (!weightKg || !heightCm) {
    return null;
  }

  const heightMeters = heightCm / 100;
  return Number((weightKg / (heightMeters * heightMeters)).toFixed(1));
}

function calculateDailyCalorieTarget(input: {
  gender: string;
  weightKg: number;
  heightCm: number;
  age: number | null;
  activityLevel: string;
  healthGoals: string[];
  targetWeightKg: number;
}) {
  if (!input.weightKg || !input.heightCm || !input.age) {
    return null;
  }

  const normalizedGender = String(input.gender || "").toLowerCase();
  const bmr =
    10 * Number(input.weightKg) +
    6.25 * Number(input.heightCm) -
    5 * Number(input.age) +
    (normalizedGender.includes("female") ? -161 : 5);

  const activity = String(input.activityLevel || "").toLowerCase();
  const multiplier = activity.includes("very")
    ? 1.725
    : activity.includes("moderate")
      ? 1.55
      : activity.includes("light")
        ? 1.375
        : 1.2;

  const goals = input.healthGoals.map((item) => item.toLowerCase());
  let adjustment = 0;

  if (goals.some((goal) => goal.includes("lose"))) {
    adjustment = -350;
  } else if (goals.some((goal) => goal.includes("build"))) {
    adjustment = 250;
  } else if (input.targetWeightKg && input.targetWeightKg < input.weightKg) {
    adjustment = -250;
  } else if (input.targetWeightKg && input.targetWeightKg > input.weightKg) {
    adjustment = 200;
  }

  return Math.max(1200, Math.round(bmr * multiplier + adjustment));
}

function formatDateForInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDate(value: string) {
  if (!value) {
    return new Date(2000, 0, 1);
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(2000, 0, 1);
  }
  return parsed;
}

function parseTagList(rawValue: string) {
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePreferenceLabel(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function ProgressDots({ step }: { step: number }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: stepCount }, (_, index) => {
        const active = index === step;
        const complete = index < step;
        return (
          <View
            key={`progress-${index}`}
            style={[styles.progressDot, active && styles.progressDotActive, complete && styles.progressDotComplete]}
          />
        );
      })}
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceChip, selected && styles.choiceChipActive]}>
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FoodChip({
  label,
  selected,
  onPress
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.foodChip, selected && styles.foodChipActive]}>
      <Text style={[styles.foodChipText, selected && styles.foodChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditing = params.mode === "edit";
  const { session, loading: authLoading, refreshSession } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [activityLevel, setActivityLevel] = useState("Moderately Active");
  const [healthGoals, setHealthGoals] = useState<string[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [likedFoods, setLikedFoods] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState<string[]>([]);
  const [likedFoodSearch, setLikedFoodSearch] = useState("");
  const [dislikedFoodSearch, setDislikedFoodSearch] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [mealsPerDay, setMealsPerDay] = useState<number>(3);
  const [wantsMealReminders, setWantsMealReminders] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mealTimes, setMealTimes] = useState({
    breakfast: "08:00 AM",
    lunch: "01:00 PM",
    dinner: "08:00 PM",
    snack: "05:00 PM"
  });

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }

    getProfile()
      .then((response) => {
        setProfile(response);
        setName(response.name || session.user.name || "");
        setDateOfBirth(response.dateOfBirth || "");
        setGender(response.gender || "");
        setHeightCm(response.heightCm ? String(response.heightCm) : "");
        setWeightKg(response.weightKg ? String(response.weightKg) : "");
        setTargetWeightKg(response.targetWeightKg ? String(response.targetWeightKg) : "");
        setActivityLevel(response.activityLevel || "Moderately Active");
        setHealthGoals(response.healthGoals || []);
        setDietaryPreferences(response.dietaryPreferences || []);
        setLikedFoods(response.likedFoods || []);
        setDislikedFoods(response.dislikedFoods || []);
        setAllergies((response.allergies || []).join(", "));
        setMedicalConditions((response.medicalConditions || []).join(", "));
        setMealsPerDay(response.mealsPerDay || 3);
        setWantsMealReminders(response.wantsMealReminders ?? true);
        setMealTimes({
          breakfast: response.mealTimes?.breakfast || "08:00 AM",
          lunch: response.mealTimes?.lunch || "01:00 PM",
          dinner: response.mealTimes?.dinner || "08:00 PM",
          snack: response.mealTimes?.snack || "05:00 PM"
        });
        setError(null);
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [session]);

  const age = useMemo(() => calculateAge(dateOfBirth), [dateOfBirth]);
  const bmi = useMemo(() => calculateBmi(Number(weightKg), Number(heightCm)), [heightCm, weightKg]);
  const calorieTarget = useMemo(
    () =>
      calculateDailyCalorieTarget({
        gender,
        weightKg: Number(weightKg),
        heightCm: Number(heightCm),
        age,
        activityLevel,
        healthGoals,
        targetWeightKg: Number(targetWeightKg)
      }),
    [activityLevel, age, gender, healthGoals, heightCm, targetWeightKg, weightKg]
  );

  const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "ios") {
      setShowDatePicker(false);
    }
    if (!selectedDate) {
      return;
    }
    setDateOfBirth(formatDateForInput(selectedDate));
  };

  const openDatePicker = () => {
    const currentDate = parseInputDate(dateOfBirth);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: "date",
        maximumDate: new Date(),
        onChange: handleDateChange
      });
      return;
    }
    setShowDatePicker(true);
  };

  const filteredLikedFoodOptions = useMemo(() => {
    const query = likedFoodSearch.trim().toLowerCase();
    const matches = likedFoodOptions.filter((option) =>
      normalizePreferenceLabel(option).toLowerCase().includes(query)
    );

    return matches.sort((left, right) => {
      const leftSelected = likedFoods.includes(left) ? 0 : 1;
      const rightSelected = likedFoods.includes(right) ? 0 : 1;
      return leftSelected - rightSelected || left.localeCompare(right);
    });
  }, [likedFoodSearch, likedFoods]);

  const filteredDislikedFoodOptions = useMemo(() => {
    const query = dislikedFoodSearch.trim().toLowerCase();
    const matches = dislikedFoodOptions.filter((option) =>
      normalizePreferenceLabel(option).toLowerCase().includes(query)
    );

    return matches.sort((left, right) => {
      const leftSelected = dislikedFoods.includes(left) ? 0 : 1;
      const rightSelected = dislikedFoods.includes(right) ? 0 : 1;
      return leftSelected - rightSelected || left.localeCompare(right);
    });
  }, [dislikedFoodSearch, dislikedFoods]);

  const canMoveNext = useMemo(() => {
    if (step === 0) {
      return Boolean(name.trim() && heightCm.trim() && weightKg.trim());
    }
    if (step === 1) {
      return likedFoods.length > 0 || dietaryPreferences.length > 0;
    }
    if (step === 2) {
      return true;
    }
    return Boolean(mealTimes.breakfast && mealTimes.lunch && mealTimes.dinner);
  }, [dietaryPreferences.length, heightCm, likedFoods.length, mealTimes.breakfast, mealTimes.dinner, mealTimes.lunch, name, step, weightKg]);

  const toggleSelection = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({
        name,
        dateOfBirth,
        gender,
        heightCm: Number(heightCm) || 0,
        weightKg: Number(weightKg) || 0,
        targetWeightKg: Number(targetWeightKg) || 0,
        activityLevel,
        healthGoals,
        dietaryPreferences,
        likedFoods: likedFoods.map(normalizePreferenceLabel),
        dislikedFoods: dislikedFoods.map(normalizePreferenceLabel),
        allergies: parseTagList(allergies),
        medicalConditions: parseTagList(medicalConditions),
        mealsPerDay,
        mealTimes: {
          breakfast: mealTimes.breakfast,
          lunch: mealTimes.lunch,
          dinner: mealTimes.dinner,
          snack: mealsPerDay >= 4 ? mealTimes.snack : null
        },
        wantsMealReminders,
        onboardingCompleted: true
      });

      setProfile(updated);
      await syncMealReminderSchedule(updated);
      setError(null);
      await refreshSession();
      router.replace(isEditing ? "/(tabs)/profile" : "/(tabs)");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!authLoading && !session) {
    return <Redirect href="/login" />;
  }

  if (!loading && profile?.onboardingCompleted && !isEditing) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <ProgressDots step={step} />
          <Text style={styles.badge}>{isEditing ? "Update your setup" : "Personalize your nutrition"}</Text>
          {step === 0 ? <Text style={styles.title}>Let’s shape your nutrition profile</Text> : null}
          {step === 1 ? <Text style={styles.title}>What do you like to eat?</Text> : null}
          {step === 2 ? <Text style={styles.title}>What would you rather avoid?</Text> : null}
          {step === 3 ? <Text style={styles.title}>How many meals do you have per day?</Text> : null}
          <Text style={styles.subtitle}>
            {step === 0
              ? "We’ll use your metrics, goals, and activity to estimate calories and build better plans."
              : step === 1
                ? "Pick foods you naturally enjoy so plans feel realistic instead of generic."
                : step === 2
                  ? "Tell us your dislikes, allergies, and medical context so suggestions avoid friction."
                : "Set your meal rhythm and times so the planner can space meals and reminders around your day."}
          </Text>
          {step > 0 ? (
            <View style={styles.selectionSummaryRow}>
              <View style={styles.selectionSummaryChip}>
                <Text style={styles.selectionSummaryLabel}>Step {step + 1}</Text>
              </View>
              {step === 1 ? (
                <View style={styles.selectionSummaryChip}>
                  <Text style={styles.selectionSummaryLabel}>{likedFoods.length} likes selected</Text>
                </View>
              ) : null}
              {step === 2 ? (
                <View style={styles.selectionSummaryChip}>
                  <Text style={styles.selectionSummaryLabel}>{dislikedFoods.length} avoids selected</Text>
                </View>
              ) : null}
              {step === 3 ? (
                <View style={styles.selectionSummaryChip}>
                  <Text style={styles.selectionSummaryLabel}>{mealsPerDay} meal rhythm</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {loading ? <LoadingCard label="Loading your health profile..." /> : null}
        {error ? <ErrorCard message={error} /> : null}

        {!loading && step === 0 ? (
          <>
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Age</Text>
                <Text style={styles.metricValue}>{age ? `${age}` : "--"}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>BMI</Text>
                <Text style={styles.metricValue}>{bmi ? `${bmi}` : "--"}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Calories</Text>
                <Text style={styles.metricValue}>{calorieTarget ? `${calorieTarget}` : "--"}</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Basic details</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={palette.textSubtle} style={styles.input} />
              <Pressable onPress={openDatePicker} style={styles.datePickerInput}>
                <Text style={dateOfBirth ? styles.datePickerValue : styles.datePickerPlaceholder}>
                  {dateOfBirth || "Date of birth"}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={palette.textMuted} />
              </Pressable>
              {showDatePicker && Platform.OS === "ios" ? (
                <View style={styles.inlineDatePickerCard}>
                  <DateTimePicker
                    value={parseInputDate(dateOfBirth)}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    onChange={handleDateChange}
                  />
                </View>
              ) : null}
              <View style={styles.rowGrid}>
                <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholder="Height in cm" placeholderTextColor={palette.textSubtle} style={[styles.input, styles.halfInput]} />
                <TextInput value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" placeholder="Weight in kg" placeholderTextColor={palette.textSubtle} style={[styles.input, styles.halfInput]} />
              </View>
              <TextInput value={targetWeightKg} onChangeText={setTargetWeightKg} keyboardType="numeric" placeholder="Target weight in kg" placeholderTextColor={palette.textSubtle} style={styles.input} />
              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.chipRow}>
                {genderOptions.map((option) => (
                  <ChoiceChip key={option} label={option} selected={gender === option} onPress={() => setGender(option)} />
                ))}
              </View>
              <Text style={styles.fieldLabel}>Activity</Text>
              <View style={styles.chipRow}>
                {activityOptions.map((option) => (
                  <ChoiceChip key={option} label={option} selected={activityLevel === option} onPress={() => setActivityLevel(option)} />
                ))}
              </View>
              <Text style={styles.fieldLabel}>Goals</Text>
              <View style={styles.chipRow}>
                {goalOptions.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    selected={healthGoals.includes(option.value)}
                    onPress={() => toggleSelection(option.value, healthGoals, setHealthGoals)}
                  />
                ))}
              </View>
              <Text style={styles.fieldLabel}>Food style</Text>
              <View style={styles.chipRow}>
                {dietaryOptions.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    selected={dietaryPreferences.includes(option.value)}
                    onPress={() => toggleSelection(option.value, dietaryPreferences, setDietaryPreferences)}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}

        {!loading && step === 1 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.stepQuestion}>Choose foods you enjoy</Text>
            <TextInput
              value={likedFoodSearch}
              onChangeText={setLikedFoodSearch}
              placeholder="Search chicken, rice, dal, paneer..."
              placeholderTextColor={palette.textSubtle}
              style={styles.searchInput}
            />
            <View style={styles.foodChipGrid}>
              {filteredLikedFoodOptions.map((option) => (
                <FoodChip
                  key={option}
                  label={option}
                  selected={likedFoods.includes(option)}
                  onPress={() => toggleSelection(option, likedFoods, setLikedFoods)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {!loading && step === 2 ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.stepQuestion}>Choose foods you’d prefer not to see</Text>
              <TextInput
                value={dislikedFoodSearch}
                onChangeText={setDislikedFoodSearch}
                placeholder="Search fish, dairy, mushrooms..."
                placeholderTextColor={palette.textSubtle}
                style={styles.searchInput}
              />
              <View style={styles.foodChipGrid}>
                {filteredDislikedFoodOptions.map((option) => (
                  <FoodChip
                    key={option}
                    label={option}
                    selected={dislikedFoods.includes(option)}
                    onPress={() => toggleSelection(option, dislikedFoods, setDislikedFoods)}
                  />
                ))}
              </View>
            </View>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Medical context</Text>
              <TextInput
                value={allergies}
                onChangeText={setAllergies}
                placeholder="Allergies (comma separated)"
                placeholderTextColor={palette.textSubtle}
                style={styles.input}
              />
              <TextInput
                value={medicalConditions}
                onChangeText={setMedicalConditions}
                placeholder="Medical conditions (comma separated)"
                placeholderTextColor={palette.textSubtle}
                style={[styles.input, styles.textArea]}
                multiline
              />
              <Text style={styles.helperText}>
                Uploaded medical records can make plans more condition-aware later, but they are optional.
              </Text>
            </View>
          </>
        ) : null}

        {!loading && step === 3 ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.stepQuestion}>Pick your meal rhythm</Text>
              <View style={styles.mealCountStack}>
                {mealsPerDayOptions.map((option) => {
                  const selected = mealsPerDay === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setMealsPerDay(option.value)}
                      style={[styles.mealCountCard, selected && styles.mealCountCardActive]}
                    >
                      <View style={[styles.mealCountBadge, selected && styles.mealCountBadgeActive]}>
                        <Text style={[styles.mealCountBadgeText, selected && styles.mealCountBadgeTextActive]}>{option.value}</Text>
                      </View>
                      <View style={styles.mealCountCopy}>
                        <Text style={[styles.mealCountTitle, selected && styles.mealCountTitleActive]}>{option.title}</Text>
                        <Text style={styles.mealCountDetail}>{option.detail}</Text>
                      </View>
                      {selected ? <Ionicons name="checkmark-circle" size={34} color="#FFAC3E" /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Meal times</Text>
              <Text style={styles.helperText}>
                Tell us your meal times so plans feel better paced and reminders can match your routine.
              </Text>
              <View style={styles.mealTimeList}>
                <View style={styles.mealTimeCard}>
                  <Text style={styles.mealTimeLabel}>Breakfast time</Text>
                  <TextInput value={mealTimes.breakfast} onChangeText={(value) => setMealTimes((current) => ({ ...current, breakfast: value }))} placeholder="08:00 AM" placeholderTextColor={palette.textSubtle} style={styles.input} />
                </View>
                <View style={styles.mealTimeCard}>
                  <Text style={styles.mealTimeLabel}>Lunch time</Text>
                  <TextInput value={mealTimes.lunch} onChangeText={(value) => setMealTimes((current) => ({ ...current, lunch: value }))} placeholder="01:00 PM" placeholderTextColor={palette.textSubtle} style={styles.input} />
                </View>
                <View style={styles.mealTimeCard}>
                  <Text style={styles.mealTimeLabel}>Dinner time</Text>
                  <TextInput value={mealTimes.dinner} onChangeText={(value) => setMealTimes((current) => ({ ...current, dinner: value }))} placeholder="08:00 PM" placeholderTextColor={palette.textSubtle} style={styles.input} />
                </View>
                {mealsPerDay >= 4 ? (
                  <View style={styles.mealTimeCard}>
                    <Text style={styles.mealTimeLabel}>Snack time</Text>
                    <TextInput value={mealTimes.snack} onChangeText={(value) => setMealTimes((current) => ({ ...current, snack: value }))} placeholder="05:00 PM" placeholderTextColor={palette.textSubtle} style={styles.input} />
                  </View>
                ) : null}
              </View>
              <View style={styles.permissionCard}>
                <View style={styles.permissionTopRow}>
                  <View style={styles.permissionBadge}>
                    <Ionicons name="notifications-outline" size={18} color="#FFAC3E" />
                  </View>
                  <View style={styles.permissionCopy}>
                    <Text style={styles.permissionTitle}>Meal reminders</Text>
                    <Text style={styles.permissionText}>
                      We’ll use these times for reminder-ready scheduling. You can turn reminders on or off any time later.
                    </Text>
                  </View>
                </View>
                <View style={styles.chipRow}>
                  <ChoiceChip label="Reminders on" selected={wantsMealReminders} onPress={() => setWantsMealReminders(true)} />
                  <ChoiceChip label="Not now" selected={!wantsMealReminders} onPress={() => setWantsMealReminders(false)} />
                </View>
              </View>
            </View>
          </>
        ) : null}

        {!loading ? (
          <View style={styles.footerShell}>
            <View style={styles.footerHintCard}>
              <Text style={styles.footerHintTitle}>
                {step < stepCount - 1 ? "Keep going" : "Ready to personalize your planner"}
              </Text>
              <Text style={styles.footerHintText}>
                {step < stepCount - 1
                  ? "Each step helps ApolloStay build more realistic meal suggestions, reminder timing, and grocery lists."
                  : "Save this setup to turn your likes, dislikes, meal timing, and reminders into a plan you can actually follow."}
              </Text>
            </View>
            <View style={styles.footerRow}>
            <Pressable onPress={() => (step > 0 ? setStep((current) => current - 1) : router.back())} style={styles.backButton}>
              <Ionicons name="chevron-back" size={18} color={palette.textSubtle} />
              <Text style={styles.backButtonText}>{step > 0 ? "Back" : "Cancel"}</Text>
            </Pressable>
            {step < stepCount - 1 ? (
              <View style={styles.footerPrimary}>
                <PrimaryButton label="Next" onPress={() => setStep((current) => current + 1)} disabled={!canMoveNext} />
              </View>
            ) : (
              <View style={styles.footerPrimary}>
                <PrimaryButton label={saving ? "Saving..." : isEditing ? "Save changes" : "Finish setup"} onPress={handleSave} disabled={saving || !canMoveNext} />
              </View>
            )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 3
  },
  heroCard: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "#FFE3BC",
    padding: spacing.xl,
    gap: spacing.md
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "#FFE6C8"
  },
  progressDotActive: {
    width: 56,
    borderRadius: 999,
    backgroundColor: "#FFAC3E"
  },
  progressDotComplete: {
    backgroundColor: "#FFB84D"
  },
  badge: {
    color: "#C76B00",
    fontSize: typography.caption,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    textAlign: "center"
  },
  title: {
    color: palette.textPrimary,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 38,
    textAlign: "center"
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 26,
    textAlign: "center"
  },
  selectionSummaryRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  selectionSummaryChip: {
    borderRadius: 999,
    backgroundColor: "#FFF5E8",
    borderWidth: 1,
    borderColor: "#FFE3BC",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  selectionSummaryLabel: {
    color: "#B96A08",
    fontSize: typography.caption,
    fontWeight: "800"
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  metricCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: 4
  },
  metricLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  metricValue: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md
  },
  sectionTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  stepQuestion: {
    color: palette.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 32,
    textAlign: "center"
  },
  fieldLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  datePickerInput: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  datePickerValue: {
    color: palette.textPrimary,
    fontSize: typography.body
  },
  datePickerPlaceholder: {
    color: palette.textSubtle,
    fontSize: typography.body
  },
  inlineDatePickerCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    overflow: "hidden"
  },
  searchInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    color: palette.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  rowGrid: {
    flexDirection: "row",
    gap: spacing.md
  },
  halfInput: {
    flex: 1
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  choiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  choiceChipActive: {
    borderColor: "#FFAC3E",
    backgroundColor: "#FFF4E6"
  },
  choiceChipText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  choiceChipTextActive: {
    color: "#C76B00"
  },
  foodChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "center"
  },
  foodChip: {
    minWidth: 132,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  foodChipActive: {
    borderColor: "#6BC89A",
    backgroundColor: "#F0FFF5"
  },
  foodChipText: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "500",
    textAlign: "center"
  },
  foodChipTextActive: {
    color: "#1D9A5B",
    fontWeight: "700"
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top"
  },
  helperText: {
    color: palette.textSubtle,
    fontSize: typography.body,
    lineHeight: 24
  },
  mealCountStack: {
    gap: spacing.md
  },
  mealCountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    padding: spacing.lg
  },
  mealCountCardActive: {
    borderColor: "#FFAC3E",
    backgroundColor: "#FFF7ED",
    borderWidth: 2
  },
  mealCountBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC"
  },
  mealCountBadgeActive: {
    backgroundColor: "#FFF1DD"
  },
  mealCountBadgeText: {
    color: "#94A3B8",
    fontSize: 28,
    fontWeight: "800"
  },
  mealCountBadgeTextActive: {
    color: "#FFAC3E"
  },
  mealCountCopy: {
    flex: 1,
    gap: 4
  },
  mealCountTitle: {
    color: palette.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800"
  },
  mealCountTitleActive: {
    color: "#A65A00"
  },
  mealCountDetail: {
    color: palette.textSubtle,
    fontSize: typography.body
  },
  mealTimeList: {
    gap: spacing.md
  },
  mealTimeCard: {
    gap: spacing.sm
  },
  mealTimeLabel: {
    color: "#FFAC3E",
    fontSize: typography.body,
    fontWeight: "700"
  },
  permissionCard: {
    borderRadius: radii.xl,
    backgroundColor: "#FFF8EF",
    borderWidth: 1,
    borderColor: "#FFE1BC",
    padding: spacing.lg,
    gap: spacing.md
  },
  permissionTopRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  permissionBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1DD"
  },
  permissionCopy: {
    flex: 1,
    gap: 4
  },
  permissionTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  permissionText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 23
  },
  footerShell: {
    gap: spacing.md,
    paddingTop: spacing.sm
  },
  footerHintCard: {
    borderRadius: radii.xl,
    backgroundColor: "#FFF9F1",
    borderWidth: 1,
    borderColor: "#FFE3BC",
    padding: spacing.md,
    gap: 4
  },
  footerHintTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  footerHintText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    lineHeight: 21
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm
  },
  backButtonText: {
    color: palette.textSubtle,
    fontSize: typography.body,
    fontWeight: "600"
  },
  footerPrimary: {
    flex: 1
  }
});
