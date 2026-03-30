import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { MetricsTrendChart } from "@/components/MetricsTrendChart";
import { getDashboard, getMedicalRecords, getWeeklyInsights } from "@/lib/api";
import { DashboardResponse, MedicalRecord, WeeklyInsights } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

function getTrendDelta(current: number | null, average: number) {
  if (current === null) {
    return "N/A";
  }
  if (!average) {
    return "0%";
  }
  const delta = Math.round(((current - average) / average) * 100);
  return `${delta > 0 ? "+" : ""}${delta}%`;
}

export default function InsightsScreen() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyInsights | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<"calories" | "protein" | "carbs" | "fat">("calories");

  const loadInsights = useCallback(() => {
    Promise.all([getDashboard(), getWeeklyInsights(), getMedicalRecords()])
      .then(([dashboardResponse, weeklyResponse, recordsResponse]) => {
        setDashboard(dashboardResponse);
        setWeekly(weeklyResponse);
        setMedicalRecords(recordsResponse);
        setError(null);
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  useFocusEffect(
    useCallback(() => {
      loadInsights();
    }, [loadInsights])
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Insights</Text>
          <Text style={styles.subtitle}>
            Weekly summaries, streaks, and adherence are computed from your real logs instead of fabricated trends.
          </Text>
        </View>

        {loading ? <LoadingCard label="Calculating weekly insights..." /> : null}
        {error ? <ErrorCard message={error} /> : null}
        {dashboard && weekly ? (
          <>
            <View style={styles.coachBriefCard}>
              <View style={styles.coachBriefHeader}>
                <View style={styles.coachBriefCopy}>
                  <Text style={styles.coachBriefEyebrow}>Weekly coach brief</Text>
                  <Text style={styles.coachBriefTitle}>
                    {dashboard.nutritionBrain?.nextBestAction?.title || "Your week is taking shape"}
                  </Text>
                  <Text style={styles.coachBriefText}>
                    {dashboard.nutritionBrain?.nextBestAction?.detail ||
                      "Keep logging consistently to unlock more precise nutrition guidance and stronger weekly insights."}
                  </Text>
                </View>
                <View style={styles.coachBriefBadge}>
                  <Text style={styles.coachBriefBadgeValue}>{weekly.adherence}%</Text>
                  <Text style={styles.coachBriefBadgeLabel}>weekly adherence</Text>
                </View>
              </View>
              <View style={styles.coachBriefPills}>
                <View style={styles.coachBriefPill}>
                  <Text style={styles.coachBriefPillLabel}>Consistency</Text>
                  <Text style={styles.coachBriefPillText}>{weekly.streaks.currentLoggingStreak} day streak</Text>
                </View>
                <View style={styles.coachBriefPill}>
                  <Text style={styles.coachBriefPillLabel}>Meals logged</Text>
                  <Text style={styles.coachBriefPillText}>{weekly.totals.mealCount} this week</Text>
                </View>
                <View style={styles.coachBriefPill}>
                  <Text style={styles.coachBriefPillLabel}>Pattern</Text>
                  <Text style={styles.coachBriefPillText}>
                    {dashboard.nutritionBrain?.memory?.routineSummary || "Building your routine memory"}
                  </Text>
                </View>
              </View>
              {dashboard.nutritionBrain?.insights?.length ? (
                <View style={styles.briefInsightRow}>
                  {dashboard.nutritionBrain.insights.slice(0, 3).map((insight) => (
                    <View
                      key={insight.title}
                      style={[styles.briefInsightChip, insight.tone === "warn" && styles.briefInsightChipWarn]}
                    >
                      <Text style={styles.briefInsightLabel}>{insight.title}</Text>
                      <Text style={styles.briefInsightText}>{insight.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.grid}>
              <MetricCard label="Current streak" value={`${weekly.streaks.currentLoggingStreak} days`} />
              <MetricCard label="Best streak" value={`${weekly.streaks.bestLoggingStreak} days`} />
              <MetricCard label="Weekly adherence" value={`${weekly.adherence}%`} detail="vs calorie target" />
              <MetricCard label="Avg calories" value={`${weekly.averages.calories} kcal`} />
            </View>

            <SectionTitle title="Metric trend graph" subtitle="A weekly trend view like a health-metrics dashboard." />
            <View style={styles.metricToggleRow}>
              {[
                ["calories", "Calories"],
                ["protein", "Protein"],
                ["carbs", "Carbs"],
                ["fat", "Fat"]
              ].map(([key, label]) => (
                <Pressable
                  key={key}
                  style={[
                    styles.metricToggle,
                    selectedMetric === key && styles.metricToggleActive
                  ]}
                  onPress={() => setSelectedMetric(key as "calories" | "protein" | "carbs" | "fat")}
                >
                  <Text
                    style={[
                      styles.metricToggleText,
                      selectedMetric === key && styles.metricToggleTextActive
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <MetricsTrendChart
              title={`Weekly ${selectedMetric} trend`}
              subtitle="Built from your real logged data for the last 7 days."
              color={
                selectedMetric === "calories"
                  ? palette.primary
                  : selectedMetric === "protein"
                    ? "#15803D"
                    : selectedMetric === "carbs"
                      ? "#B45309"
                      : "#B91C1C"
              }
              unit={selectedMetric === "calories" ? "kcal" : "g"}
              points={weekly.days.map((day) => ({
                label: day.date.slice(5),
                value: day[selectedMetric]
              }))}
            />

            <SectionTitle title="Health metrics" subtitle="A simpler snapshot built from your profile and parsed medical values." />
            <View style={styles.healthMetricGrid}>
              {buildHealthMetricCards(dashboard, medicalRecords).map((card) => (
                <View key={card.label} style={[styles.healthMetricCard, card.featured && styles.healthMetricCardFeatured]}>
                  <Text style={[styles.healthMetricLabel, card.featured && styles.healthMetricLabelFeatured]}>{card.label}</Text>
                  <Text style={[styles.healthMetricValue, card.featured && styles.healthMetricValueFeatured]}>{card.value}</Text>
                  <Text style={[styles.healthMetricDetail, card.featured && styles.healthMetricDetailFeatured]}>{card.detail}</Text>
                </View>
              ))}
            </View>

            <View style={styles.healthTrendCard}>
              <View style={styles.healthTrendHeader}>
                <View style={styles.healthTrendText}>
                  <Text style={styles.healthTrendTitle}>Weekly health rhythm</Text>
                  <Text style={styles.healthTrendSubtitle}>
                    This view shows how consistently you logged meals across the week, which is the strongest driver of insight quality right now.
                  </Text>
                </View>
                <View style={styles.healthTrendBadge}>
                  <Text style={styles.healthTrendBadgeValue}>{weekly.streaks.currentLoggingStreak}</Text>
                  <Text style={styles.healthTrendBadgeLabel}>day streak</Text>
                </View>
              </View>

              <View style={styles.healthTrendBars}>
                {weekly.days.map((day) => {
                  const activityHeight = Math.max(18, Math.min(100, (day.mealCount / 4) * 100));
                  return (
                    <View key={day.date} style={styles.healthTrendBarColumn}>
                      <View style={styles.healthTrendBarTrack}>
                        <View style={[styles.healthTrendBarFill, { height: `${activityHeight}%` }]} />
                      </View>
                      <Text style={styles.healthTrendBarLabel}>{day.date.slice(8)}</Text>
                      <Text style={styles.healthTrendBarValue}>{day.mealCount}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <SectionTitle title="Macro patterns" subtitle="Current day compared with this week’s averages." />
            <View style={styles.grid}>
              <MetricCard
                label="Protein"
                value={`${dashboard.summary.protein} g`}
                detail={getTrendDelta(dashboard.summary.protein, weekly.averages.protein)}
              />
              <MetricCard
                label="Carbs"
                value={`${dashboard.summary.carbs} g`}
                detail={getTrendDelta(dashboard.summary.carbs, weekly.averages.carbs)}
              />
              <MetricCard
                label="Fat"
                value={`${dashboard.summary.fat} g`}
                detail={getTrendDelta(dashboard.summary.fat, weekly.averages.fat)}
              />
              <MetricCard
                label="Meals this week"
                value={`${weekly.totals.mealCount}`}
                detail={`${dashboard.summary.mealCount} today`}
              />
            </View>

            <SectionTitle title="Highlights" subtitle="High-signal interpretations from your weekly data." />
            <View style={styles.highlightsWrap}>
              <View style={styles.highlightCard}>
                <Text style={styles.highlightLabel}>Coverage</Text>
                <Text style={styles.highlightValue}>{weekly.days.filter((day) => day.mealCount > 0).length}/7 days</Text>
                <Text style={styles.highlightText}>You logged food on this many days, which drives how strong your trend analysis feels.</Text>
              </View>
              <View style={styles.highlightCard}>
                <Text style={styles.highlightLabel}>Calorie trend</Text>
                <Text style={styles.highlightValue}>{getTrendDelta(dashboard.summary.calories, weekly.averages.calories)}</Text>
                <Text style={styles.highlightText}>Today compared with your weekly calorie average.</Text>
              </View>
              <View style={styles.highlightCard}>
                <Text style={styles.highlightLabel}>Streak quality</Text>
                <Text style={styles.highlightValue}>{weekly.streaks.bestLoggingStreak} days best</Text>
                <Text style={styles.highlightText}>
                  Current streak: {weekly.streaks.currentLoggingStreak} day(s). Keep this going to improve recommendation accuracy.
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {weekly && weekly.totals.mealCount === 0 ? (
          <EmptyCard title="Not enough data yet" detail="Log meals for a few days to unlock meaningful weekly insights." />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function findLatestMetric(records: MedicalRecord[], pattern: RegExp) {
  for (const record of records) {
    const vital = record.extracted.vitals.find((item) => pattern.test(item.name));
    if (vital?.value !== null && vital?.value !== undefined) {
      return `${vital.value}${vital.unit ? ` ${vital.unit}` : ""}`;
    }

    const lab = record.extracted.labResults.find((item) => pattern.test(item.name));
    if (lab?.value !== null && lab?.value !== undefined) {
      return `${lab.value}${lab.unit ? ` ${lab.unit}` : ""}`;
    }
  }

  return "--";
}

function buildHealthMetricCards(
  dashboard: DashboardResponse,
  medicalRecords: MedicalRecord[]
) {
  const weight = dashboard.profile.weightKg ? `${dashboard.profile.weightKg} kg` : "--";
  const bmi = dashboard.profile.bmi ? `${dashboard.profile.bmi}` : "--";
  const bloodPressure = findLatestMetric(medicalRecords, /blood pressure|bp/i);
  const bloodGlucose = findLatestMetric(medicalRecords, /blood glucose|glucose|hba1c/i);
  const heartRate = findLatestMetric(medicalRecords, /heart rate|pulse/i);

  return [
    { label: "Weight", value: weight, detail: "Current profile metric", featured: true },
    { label: "Blood pressure", value: bloodPressure, detail: "Latest parsed record" },
    { label: "Blood glucose", value: bloodGlucose, detail: "Latest parsed record" },
    { label: "Heart rate", value: heartRate, detail: "Latest parsed record" },
    { label: "BMI", value: bmi, detail: "Profile health marker" }
  ];
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  coachBriefCard: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: "#0F172A"
  },
  coachBriefHeader: {
    gap: spacing.md,
  },
  coachBriefCopy: {
    gap: spacing.xs
  },
  coachBriefEyebrow: {
    color: "#93C5FD",
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  coachBriefTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30
  },
  coachBriefText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: typography.body,
    lineHeight: 23
  },
  coachBriefBadge: {
    width: "100%",
    minWidth: 0,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.26)",
    alignItems: "center",
    justifyContent: "center"
  },
  coachBriefBadgeValue: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800"
  },
  coachBriefBadgeLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: typography.caption,
    fontWeight: "700"
  },
  coachBriefPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  coachBriefPill: {
    width: "100%",
    borderRadius: radii.lg,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2
  },
  coachBriefPillLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  coachBriefPillText: {
    color: "#FFFFFF",
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  briefInsightRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  briefInsightChip: {
    width: "100%",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.22)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2
  },
  briefInsightChipWarn: {
    borderColor: "rgba(251,191,36,0.26)"
  },
  briefInsightLabel: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  briefInsightText: {
    color: "#E2E8F0",
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  metricToggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  metricToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  metricToggleActive: {
    borderColor: "#BFDBFE",
    backgroundColor: "#DBEAFE"
  },
  metricToggleText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  metricToggleTextActive: {
    color: palette.primary
  },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  healthMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  healthMetricCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.xs
  },
  healthMetricCardFeatured: {
    backgroundColor: palette.primary
  },
  healthMetricLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  healthMetricLabelFeatured: {
    color: "rgba(255,255,255,0.84)"
  },
  healthMetricValue: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: "800"
  },
  healthMetricValueFeatured: {
    color: "#FFFFFF"
  },
  healthMetricDetail: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  healthMetricDetailFeatured: {
    color: "rgba(255,255,255,0.76)"
  },
  healthTrendCard: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.lg
  },
  healthTrendHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    alignItems: "flex-start",
    flexWrap: "wrap"
  },
  healthTrendText: {
    flex: 1,
    gap: 4
  },
  healthTrendTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  healthTrendSubtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  healthTrendBadge: {
    minWidth: 96,
    borderRadius: 20,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center"
  },
  healthTrendBadgeValue: {
    color: palette.primary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  healthTrendBadgeLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  healthTrendBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  healthTrendBarColumn: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  healthTrendBarTrack: {
    width: "100%",
    height: 120,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  healthTrendBarFill: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: palette.primary
  },
  healthTrendBarLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  healthTrendBarValue: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  note: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 24
  },
  highlightsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  highlightCard: {
    flexGrow: 1,
    minWidth: 160,
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.xs
  },
  highlightLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  highlightValue: {
    color: palette.textPrimary,
    fontSize: 22,
    fontWeight: "800"
  },
  highlightText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  }
});
