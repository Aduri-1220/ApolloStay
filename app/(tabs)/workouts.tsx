import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/AsyncState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import {
  createWorkoutLog,
  getWorkoutCategories,
  getWorkoutExercises,
  getWorkoutLogs,
  getWorkoutStats
} from "@/lib/api";
import { WorkoutExercise, WorkoutLog, WorkoutStats } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

const ALL_CATEGORY = "All";

export default function WorkoutsScreen() {
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasWorkoutContent = Boolean(stats) || logs.length > 0 || exercises.length > 0 || categories.length > 1;
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [caloriesBurned, setCaloriesBurned] = useState("");
  const [notes, setNotes] = useState("");

  const loadWorkoutData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsResponse, logsResponse, categoriesResponse, exercisesResponse] = await Promise.allSettled([
        getWorkoutStats(),
        getWorkoutLogs(),
        getWorkoutCategories(),
        getWorkoutExercises()
      ]);

      const loadErrors: string[] = [];

      if (statsResponse.status === "fulfilled") {
        setStats(statsResponse.value);
      } else {
        loadErrors.push(statsResponse.reason?.message || "Workout stats could not load.");
      }

      if (logsResponse.status === "fulfilled") {
        setLogs(logsResponse.value);
      } else {
        loadErrors.push(logsResponse.reason?.message || "Workout history could not load.");
      }

      if (categoriesResponse.status === "fulfilled") {
        setCategories([ALL_CATEGORY, ...categoriesResponse.value]);
      } else {
        setCategories([ALL_CATEGORY]);
        loadErrors.push(categoriesResponse.reason?.message || "Workout categories could not load.");
      }

      if (exercisesResponse.status === "fulfilled") {
        setExercises(exercisesResponse.value);
      } else {
        loadErrors.push(exercisesResponse.reason?.message || "Workout library could not load.");
      }

      setError(loadErrors.length > 0 ? loadErrors[0] : null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkoutData();
  }, [loadWorkoutData]);

  useFocusEffect(
    useCallback(() => {
      loadWorkoutData();
    }, [loadWorkoutData])
  );

  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return exercises.filter((exercise) => {
      if (selectedCategory !== ALL_CATEGORY && exercise.category !== selectedCategory) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        exercise.name.toLowerCase().includes(query) ||
        exercise.category.toLowerCase().includes(query) ||
        exercise.muscleGroups.some((group) => group.toLowerCase().includes(query))
      );
    });
  }, [exercises, searchQuery, selectedCategory]);

  const quickStarts = filteredExercises.slice(0, 6);

  const handleSelectExercise = (exercise: WorkoutExercise) => {
    setSelectedExercise(exercise);
    setDurationMinutes(String(exercise.durationMinutes));
    setCaloriesBurned(String(exercise.caloriesBurned));
    setError(null);
  };

  const handleSaveWorkout = async () => {
    if (!selectedExercise) {
      setError("Pick an exercise before saving a workout.");
      return;
    }

    try {
      setSaving(true);
      const saved = await createWorkoutLog({
        exerciseId: selectedExercise.id,
        durationMinutes: Number(durationMinutes || selectedExercise.durationMinutes),
        caloriesBurned: caloriesBurned ? Number(caloriesBurned) : selectedExercise.caloriesBurned,
        notes
      });
      setLogs((current) => [saved, ...current]);
      setStats(await getWorkoutStats());
      setSelectedExercise(null);
      setDurationMinutes("30");
      setCaloriesBurned("");
      setNotes("");
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Workouts</Text>
          <Text style={styles.subtitle}>
            Build consistency with quick sessions, strength work, cardio, yoga, and mobility tracked inside ApolloStay.
          </Text>
        </View>

        {loading ? <LoadingCard label="Loading workouts..." /> : null}
        {error && !hasWorkoutContent ? <ErrorCard message={error} /> : null}

        {stats ? (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, styles.statCardFeatured]}>
              <Text style={styles.statLabelFeatured}>This week</Text>
              <Text style={styles.statValueFeatured}>{stats.weeklySessions}</Text>
              <Text style={styles.statDetailFeatured}>sessions logged</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Minutes</Text>
              <Text style={styles.statValue}>{stats.weeklyMinutes}</Text>
              <Text style={styles.statDetail}>weekly total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Calories</Text>
              <Text style={styles.statValue}>{stats.weeklyCalories}</Text>
              <Text style={styles.statDetail}>burned</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Top focus</Text>
              <Text style={styles.statValueSmall}>{stats.favoriteCategory}</Text>
              <Text style={styles.statDetail}>most logged</Text>
            </View>
          </View>
        ) : null}

        <SectionTitle title="Browse exercises" subtitle="Use the built-in workout library even without wearable sync." />
        <View style={styles.card}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search walking, yoga, dumbbells..."
            placeholderTextColor={palette.textSubtle}
            style={styles.searchInput}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {categories.map((category) => (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[styles.categoryChip, selectedCategory === category && styles.categoryChipActive]}
              >
                <Text style={[styles.categoryChipText, selectedCategory === category && styles.categoryChipTextActive]}>
                  {category}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.exerciseList}>
            {quickStarts.length > 0 ? (
              quickStarts.map((exercise) => (
                <Pressable
                  key={exercise.id}
                  onPress={() => handleSelectExercise(exercise)}
                  style={[
                    styles.exerciseCard,
                    selectedExercise?.id === exercise.id && styles.exerciseCardSelected
                  ]}
                >
                  <View style={styles.exerciseHeader}>
                    <View style={styles.exerciseTitleBlock}>
                      <Text style={styles.exerciseTitle}>{exercise.name}</Text>
                      <Text style={styles.exerciseMeta}>
                        {exercise.category} · {exercise.difficulty} · {exercise.equipment}
                      </Text>
                    </View>
                    <View style={styles.exerciseBadge}>
                      <Ionicons name="barbell-outline" size={18} color={palette.primary} />
                    </View>
                  </View>
                  <Text style={styles.exerciseMuscles}>{exercise.muscleGroups.join(" · ")}</Text>
                  <View style={styles.exerciseFooter}>
                    <Text style={styles.exerciseMetric}>{exercise.durationMinutes} min</Text>
                    <Text style={styles.exerciseMetric}>{exercise.caloriesBurned} kcal</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <EmptyCard title="No workouts found" detail="Try a different search or switch category." />
            )}
          </View>
        </View>

        <SectionTitle title="Quick log" subtitle="Select an exercise and save your workout to today's history." />
        <View style={styles.card}>
          {selectedExercise ? (
            <>
              <View style={styles.selectedHeader}>
                <View style={styles.selectedCopy}>
                  <Text style={styles.selectedTitle}>{selectedExercise.name}</Text>
                  <Text style={styles.selectedMeta}>
                    {selectedExercise.category} · {selectedExercise.difficulty}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedExercise(null)} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </Pressable>
              </View>
              <Text style={styles.instructionsTitle}>How to do it</Text>
              {selectedExercise.instructions.map((instruction, index) => (
                <Text key={`${selectedExercise.id}-${index}`} style={styles.instructionText}>
                  {index + 1}. {instruction}
                </Text>
              ))}
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Duration (min)</Text>
                  <TextInput
                    value={durationMinutes}
                    onChangeText={setDurationMinutes}
                    keyboardType="number-pad"
                    style={styles.fieldInput}
                    placeholder="30"
                    placeholderTextColor={palette.textSubtle}
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Calories</Text>
                  <TextInput
                    value={caloriesBurned}
                    onChangeText={setCaloriesBurned}
                    keyboardType="number-pad"
                    style={styles.fieldInput}
                    placeholder={String(selectedExercise.caloriesBurned)}
                    placeholderTextColor={palette.textSubtle}
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                style={[styles.fieldInput, styles.notesInput]}
                placeholder="How did it feel? Any changes or weights used?"
                placeholderTextColor={palette.textSubtle}
                multiline
              />
              <PrimaryButton label={saving ? "Saving workout..." : "Save workout"} onPress={handleSaveWorkout} disabled={saving} />
            </>
          ) : (
            <EmptyCard
              title="Pick a workout to log"
              detail="Tap any exercise above and ApolloStay will prepare a quick logging form here."
            />
          )}
        </View>

        <SectionTitle title="Recent sessions" subtitle="Your latest workout entries stay here for quick review." />
        {logs.length > 0 ? (
          <View style={styles.card}>
            {logs.slice(0, 8).map((log) => (
              <View key={log.id} style={styles.logRow}>
                <View style={styles.logCopy}>
                  <Text style={styles.logTitle}>{log.title}</Text>
                  <Text style={styles.logMeta}>
                    {log.category} · {new Date(log.performedAt).toLocaleDateString()} · {log.durationMinutes} min
                  </Text>
                  {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
                </View>
                <Text style={styles.logCalories}>{log.caloriesBurned ?? 0} kcal</Text>
              </View>
            ))}
          </View>
        ) : (
          <EmptyCard title="No workouts logged yet" detail="Save your first session from the quick log card above." />
        )}
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
  header: {
    gap: spacing.sm
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.h1,
    fontWeight: "800"
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 24
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  statCard: {
    flexBasis: "47%",
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.xs
  },
  statCardFeatured: {
    backgroundColor: palette.primary,
    borderColor: palette.primary
  },
  statLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  statLabelFeatured: {
    color: "#DBEAFE",
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  statValue: {
    color: palette.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800"
  },
  statValueSmall: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  statValueFeatured: {
    color: "#FFFFFF",
    fontSize: typography.h1,
    fontWeight: "800"
  },
  statDetail: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  statDetailFeatured: {
    color: "#DBEAFE",
    fontSize: typography.caption
  },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  searchInput: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    color: palette.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  categoryRow: {
    gap: spacing.sm,
    paddingRight: spacing.md
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  categoryChipActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD"
  },
  categoryChipText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  categoryChipTextActive: {
    color: palette.primary
  },
  exerciseList: {
    gap: spacing.md
  },
  exerciseCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    padding: spacing.md,
    gap: spacing.sm
  },
  exerciseCardSelected: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF"
  },
  exerciseHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  exerciseTitleBlock: {
    flex: 1,
    gap: spacing.xs
  },
  exerciseTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  exerciseMeta: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  exerciseBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DBEAFE"
  },
  exerciseMuscles: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  exerciseFooter: {
    flexDirection: "row",
    gap: spacing.md
  },
  exerciseMetric: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  selectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  selectedCopy: {
    flex: 1,
    gap: spacing.xs
  },
  selectedTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  selectedMeta: {
    color: palette.textMuted,
    fontSize: typography.body
  },
  clearButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  clearButtonText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  instructionsTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  instructionText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  formRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  formField: {
    flex: 1,
    gap: spacing.xs
  },
  fieldLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  fieldInput: {
    minHeight: 50,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    color: palette.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: "top"
  },
  logRow: {
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  logCopy: {
    flex: 1,
    gap: spacing.xs
  },
  logTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "800"
  },
  logMeta: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  logNotes: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    lineHeight: 18
  },
  logCalories: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  }
});
