import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBar } from "@/components/ProgressBar";
import { addWaterLog, deleteWaterLog, getDashboard } from "@/lib/api";
import { useWearableData } from "@/lib/useWearableData";
import { DashboardResponse } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

function displayNutrient(value: number | null, unit: string) {
  return value === null ? "Unavailable" : `${value} ${unit}`;
}

function formatHeroMetric(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "0";
  }

  if (Math.abs(value) >= 100) {
    return `${Math.round(value)}`;
  }

  return `${Math.round(value * 10) / 10}`;
}

function formatLastSynced(value: string | null) {
  if (!value) {
    return "Not synced yet";
  }

  return `Updated ${new Date(value).toLocaleString()}`;
}

function groupHydrationLogs(logs: DashboardResponse["hydrationLogs"]) {
  const groups: Array<{
    minuteKey: string;
    count: number;
    totalMl: number;
    logIds: string[];
  }> = [];

  for (const log of logs || []) {
    const minuteKey = new Date(log.loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const previous = groups[groups.length - 1];

    if (previous && previous.minuteKey === minuteKey) {
      previous.count += 1;
      previous.totalMl += Number(log.amountMl || 0);
      previous.logIds.push(log.id);
      continue;
    }

    groups.push({
      minuteKey,
      count: 1,
      totalMl: Number(log.amountMl || 0),
      logIds: [log.id]
    });
  }

  return groups.slice(0, 4);
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 420;
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrationBusy, setHydrationBusy] = useState(false);
  const { snapshot, status, loading: wearableLoading, reloadWearableStatus } = useWearableData();

  const loadDashboard = useCallback(() => {
    setLoading(true);
    getDashboard()
      .then((response) => {
        setDashboard(response);
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
    loadDashboard();
  }, [loadDashboard]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
      reloadWearableStatus();
    }, [loadDashboard, reloadWearableStatus])
  );

  const handleQuickWaterAdd = async (amountMl: number) => {
    try {
      setHydrationBusy(true);
      await addWaterLog({ amountMl });
      await loadDashboard();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setHydrationBusy(false);
    }
  };

  const handleDeleteWaterLog = async (logId: string) => {
    try {
      setHydrationBusy(true);
      await deleteWaterLog(logId);
      await loadDashboard();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setHydrationBusy(false);
    }
  };

  const handleDashboardAction = (ctaMode: string) => {
    if (ctaMode === "voice") {
      router.push({ pathname: "/(tabs)/nutrition", params: { composerMode: "voice" } });
      return;
    }
    if (ctaMode === "meal-plan") {
      router.push("/(tabs)/meal-plans");
      return;
    }
    router.push({ pathname: "/(tabs)/nutrition", params: { composerMode: "search" } });
  };

  const hydrationTargetGlasses = dashboard ? Math.max(1, Math.ceil(dashboard.summary.waterTargetMl / 250)) : 0;
  const hydrationFilledGlasses = dashboard ? Math.floor(dashboard.summary.waterIntakeMl / 250) : 0;
  const hydrationRecentLogs = groupHydrationLogs(dashboard?.hydrationLogs || []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={["#DBEAFE", "#EFF6FF", "#F8FAFC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.eyebrow}>ApolloStay dashboard</Text>
          <Text style={styles.title}>Today at a glance</Text>
          <Text style={styles.subtitle}>
            Real meal logs, weekly nutrition trends, and streaks grounded in your saved data.
          </Text>

          {dashboard ? (
            <View style={styles.glanceGrid}>
              <View style={styles.glanceCard}>
                <View style={styles.glanceHeader}>
                  <Text style={styles.glanceLabel}>Calories</Text>
                  <View style={[styles.glanceIconWrap, styles.glanceOrange]}>
                    <Ionicons name="flame" size={20} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={styles.glanceValue}>{formatHeroMetric(dashboard.summary.calories)}</Text>
                <Text style={styles.glanceDetail}>of {dashboard.profile.dailyCalorieTarget} kcal</Text>
                <View style={[styles.glanceAccent, styles.glanceAccentOrange]} />
              </View>
              <View style={styles.glanceCard}>
                <View style={styles.glanceHeader}>
                  <Text style={styles.glanceLabel}>Steps</Text>
                  <View style={[styles.glanceIconWrap, styles.glanceGreen]}>
                    <Ionicons name="footsteps" size={20} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={styles.glanceValue}>{snapshot.steps === null ? "--" : formatHeroMetric(snapshot.steps)}</Text>
                <Text style={styles.glanceDetail}>
                  {snapshot.connected
                    ? formatLastSynced(snapshot.lastSyncedAt)
                    : wearableLoading
                      ? "Refreshing wearable status..."
                      : "Connect Apple Health, Health Connect, Polar, or Whoop"}
                </Text>
                <Text style={styles.glanceSubMetric}>
                  {snapshot.connected ? `Source: ${snapshot.source || "Wearable"}` : `Connected: ${status.connectedDevices.length}`}
                </Text>
                <View style={[styles.glanceAccent, styles.glanceAccentGreen]} />
              </View>
              <View style={styles.glanceCard}>
                <View style={styles.glanceHeader}>
                  <Text style={styles.glanceLabel}>Sleep</Text>
                  <View style={[styles.glanceIconWrap, styles.glanceViolet]}>
                    <Ionicons name="moon" size={20} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={styles.glanceValue}>
                  {snapshot.sleepHours === null ? "--" : `${formatHeroMetric(snapshot.sleepHours)}h`}
                </Text>
                <Text style={styles.glanceDetail}>
                  {snapshot.connected
                    ? snapshot.heartRate
                      ? `${snapshot.heartRate.label}: ${snapshot.heartRate.value}`
                      : "Sleep from your latest wearable sync"
                    : "Sleep will appear once a supported source is connected"}
                </Text>
                <Text style={styles.glanceSubMetric}>
                  {snapshot.connected ? formatLastSynced(snapshot.lastSyncedAt) : "Last night"}
                </Text>
                <View style={[styles.glanceAccent, styles.glanceAccentViolet]} />
              </View>
              <View style={styles.glanceCard}>
                <View style={styles.glanceHeader}>
                  <Text style={styles.glanceLabel}>Water</Text>
                  <View style={[styles.glanceIconWrap, styles.glanceCyan]}>
                    <Ionicons name="water" size={20} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={styles.glanceValue}>{Math.round(dashboard.summary.waterIntakeMl / 250)}</Text>
                <Text style={styles.glanceDetail}>glasses today</Text>
                <Text style={styles.glanceSubMetric}>Target: {Math.round(dashboard.summary.waterTargetMl / 250)} glasses</Text>
                <View style={[styles.glanceAccent, styles.glanceAccentCyan]} />
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {loading ? <LoadingCard label="Loading dashboard from the API..." /> : null}
        {error ? <ErrorCard message={error} /> : null}

        {dashboard ? (
          <>
            <SectionTitle title="Next best action" subtitle="One smart move based on today's intake, hydration, and your recent habits." />
            <Pressable
              onPress={() => handleDashboardAction(dashboard.nutritionBrain.nextBestAction.ctaMode)}
              style={styles.actionSpotlight}
            >
              <LinearGradient
                colors={["#EFF6FF", "#FFFFFF", "#F8FAFC"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionSpotlightGradient}
              >
                <View style={styles.actionSpotlightHeader}>
                  <View style={styles.actionSpotlightEyebrow}>
                    <Ionicons name="sparkles" size={14} color={palette.primary} />
                    <Text style={styles.actionSpotlightEyebrowText}>ApolloStay coach</Text>
                  </View>
                  <View style={styles.actionSpotlightArrow}>
                    <Ionicons name="arrow-forward" size={18} color={palette.primary} />
                  </View>
                </View>
                <Text style={styles.actionSpotlightTitle}>{dashboard.nutritionBrain.nextBestAction.title}</Text>
                <Text style={styles.actionSpotlightDetail}>{dashboard.nutritionBrain.nextBestAction.detail}</Text>
                <View style={styles.actionSpotlightFooter}>
                  <Text style={styles.actionSpotlightCta}>{dashboard.nutritionBrain.nextBestAction.ctaLabel}</Text>
                  <Text style={styles.actionSpotlightMemory}>{dashboard.nutritionBrain.memory.routineSummary}</Text>
                </View>
              </LinearGradient>
            </Pressable>

            <SectionTitle title="Daily progress" subtitle={`For ${dashboard.date}`} />
            <View style={styles.progressPanel}>
              <ProgressBar label="Calories" value={dashboard.summary.calories} target={dashboard.profile.dailyCalorieTarget} color={palette.primary} />
              <ProgressBar label="Protein" value={dashboard.summary.protein} target={Math.round(dashboard.profile.weightKg * 1.2)} color={palette.success} />
              <ProgressBar label="Carbs" value={dashboard.summary.carbs} target={Math.round((dashboard.profile.dailyCalorieTarget * 0.45) / 4)} color={palette.warning} />
              <ProgressBar label="Fat" value={dashboard.summary.fat} target={Math.round((dashboard.profile.dailyCalorieTarget * 0.25) / 9)} color={palette.error} />
              <ProgressBar label="Water" value={dashboard.summary.waterIntakeMl} target={dashboard.summary.waterTargetMl} color={palette.primaryHover} />
            </View>

            <SectionTitle title="Hydration" subtitle="Quick-add water and track your daily intake target." />
            <View style={styles.hydrationCard}>
              <View style={styles.hydrationTopRow}>
                <View style={styles.hydrationInfo}>
                  <View style={styles.hydrationTitleRow}>
                    <Text style={styles.cardTitle}>Today's water</Text>
                    <View style={styles.hydrationGlassBadge}>
                      <Ionicons name="water" size={16} color="#FFFFFF" />
                      <Text style={styles.hydrationGlassBadgeText}>{hydrationFilledGlasses}</Text>
                    </View>
                  </View>
                  <Text style={styles.hydrationPrimaryValue}>
                    {dashboard.summary.waterIntakeMl} / {dashboard.summary.waterTargetMl} ml
                  </Text>
                  <Text style={styles.hydrationMetaLine}>
                    {dashboard.summary.remainingWaterMl} ml left · 1 tap = 250 ml
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleQuickWaterAdd(250)}
                  style={[styles.hydrationAddButton, hydrationBusy && styles.hydrationPrimaryAddDisabled]}
                  disabled={hydrationBusy}
                >
                  <Ionicons name="add" size={22} color="#FFFFFF" />
                  <Text style={styles.hydrationAddButtonText}>{hydrationBusy ? "..." : "250 ml"}</Text>
                </Pressable>
              </View>
              <View style={styles.hydrationMiniProgressTrack}>
                <View
                  style={[
                    styles.hydrationMiniProgressFill,
                    { width: `${Math.min(100, (dashboard.summary.waterIntakeMl / Math.max(1, dashboard.summary.waterTargetMl)) * 100)}%` }
                  ]}
                />
              </View>
              <Text style={styles.hydrationTargetHint}>
                {hydrationFilledGlasses} of {hydrationTargetGlasses} glasses toward today's target
              </Text>
              <View style={styles.hydrationHistoryCard}>
                <Text style={styles.hydrationHistoryTitle}>Recent taps</Text>
                {hydrationRecentLogs.length > 0 ? (
                  <View style={styles.hydrationHistoryChipList}>
                    {hydrationRecentLogs.map((log) => (
                      <View key={`${log.minuteKey}-${log.logIds[0]}`} style={styles.hydrationHistoryChip}>
                        <Ionicons name="water-outline" size={14} color={palette.primary} />
                        <Text style={styles.hydrationHistoryChipText}>
                          {log.count > 1 ? `${log.count} glasses · ${log.totalMl} ml` : `${log.totalMl} ml`} · {log.minuteKey}
                        </Text>
                        <Pressable
                          onPress={() => handleDeleteWaterLog(log.logIds[0])}
                          style={styles.hydrationChipDeleteButton}
                          disabled={hydrationBusy}
                        >
                          <Ionicons name="close" size={14} color={palette.error} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.hydrationEmptyText}>No glasses logged yet. Tap a glass to start.</Text>
                )}
              </View>
            </View>

            <View style={[styles.twoColumn, isCompact && styles.singleColumn]}>
              <View style={[styles.card, isCompact && styles.fullWidthCard]}>
                <Text style={styles.cardTitle}>Wearable sync</Text>
                <Text style={styles.subtitle}>
                  {snapshot.connected
                    ? `${snapshot.source || "Wearable"} is connected and ready to enrich your dashboard.`
                    : "Connect a device from Profile to bring in steps, sleep, and recovery metrics."}
                </Text>
                <MetricCard label="Connected devices" value={`${status.connectedDevices.length}`} detail={status.connectedDevices.join(", ") || "None"} />
                <MetricCard label="Resting HR" value={snapshot.restingHeartRate?.value || "--"} detail={snapshot.restingHeartRate?.observedAt || "No recent reading"} />
                <MetricCard label="Active calories" value={snapshot.activeCalories === null ? "--" : `${formatHeroMetric(snapshot.activeCalories)} kcal`} detail={snapshot.lastSyncedAt ? formatLastSynced(snapshot.lastSyncedAt) : "Sync pending"} />
              </View>

              <View style={[styles.card, isCompact && styles.fullWidthCard]}>
                <Text style={styles.cardTitle}>Weekly nutrition</Text>
                {dashboard.weeklySummary.days.map((day) => (
                  <View key={day.date} style={styles.weekRow}>
                    <Text style={styles.weekLabel}>{day.date.slice(5)}</Text>
                    <View style={styles.weekBarTrack}>
                      <View
                        style={[
                          styles.weekBarFill,
                          { width: `${Math.min(100, (day.calories / dashboard.profile.dailyCalorieTarget) * 100)}%` }
                        ]}
                      />
                    </View>
                    <Text style={styles.weekValue}>{day.calories} kcal</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.card, isCompact && styles.fullWidthCard]}>
                <Text style={styles.cardTitle}>Readiness snapshot</Text>
                <MetricCard label="Average calories" value={`${dashboard.weeklySummary.averages.calories} kcal`} />
                <MetricCard label="Weekly meals" value={`${dashboard.weeklySummary.totals.mealCount}`} />
                <MetricCard label="Best streak" value={`${dashboard.weeklySummary.streaks.bestLoggingStreak} days`} />
                <MetricCard label="Remaining today" value={`${dashboard.summary.remainingCalories} kcal`} />
                <View style={styles.insightPillWrap}>
                  {dashboard.nutritionBrain.insights.map((insight) => (
                    <View key={insight.title} style={[styles.insightPill, insight.tone === "warn" && styles.insightPillWarn]}>
                      <Text style={styles.insightPillLabel}>{insight.title}</Text>
                      <Text style={styles.insightPillText}>{insight.detail}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <SectionTitle title="Recent meals" subtitle="Latest entries from your food log." />
            {dashboard.logs.length > 0 ? (
              <View style={styles.card}>
                {dashboard.logs.slice(0, 6).map((log, index) => (
                  <View
                    key={`${log.id}-${index}`}
                    style={[styles.recentMealRow, index === dashboard.logs.slice(0, 6).length - 1 && styles.recentMealRowLast]}
                  >
                    <View style={styles.recentMealCopy}>
                      <Text style={styles.recentMealTitle}>{log.food.description}</Text>
                      <Text style={styles.recentMealMeta}>
                        {formatMealTypeLabel(log.mealType)} • {new Date(log.consumedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.recentMealCalories}>{formatHeroMetric(log.nutrients.calories)} kcal</Text>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyCard title="No meals logged yet" detail="Use the Nutrition tab to start building your day." />
            )}

            <SectionTitle title="Quick actions" subtitle="Jump straight into the most-used parts of ApolloStay." />
            <View style={styles.quickActionPanel}>
              <View style={styles.quickActionGrid}>
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/nutrition", params: { composerMode: "search" } })}
                style={styles.quickActionChip}
              >
                <View style={[styles.quickActionIcon, styles.quickActionIconWarm]}>
                  <Ionicons name="add" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>Log food</Text>
                  <Text style={styles.quickActionSubtitle}>Search or add a meal</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/nutrition",
                    params: { composerMode: "scan" }
                  })
                }
                style={styles.quickActionChip}
              >
                <View style={[styles.quickActionIcon, styles.quickActionIconLavender]}>
                  <Ionicons name="camera-outline" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>Scan plate</Text>
                  <Text style={styles.quickActionSubtitle}>Estimate meal nutrients</Text>
                </View>
              </Pressable>

              <Pressable onPress={() => router.push("/(tabs)/meal-plans")} style={styles.quickActionChip}>
                <View style={[styles.quickActionIcon, styles.quickActionIconSky]}>
                  <Ionicons name="sparkles-outline" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>AI meal plan</Text>
                  <Text style={styles.quickActionSubtitle}>Generate your day</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/nutrition", params: { composerMode: "voice" } })}
                style={styles.quickActionChip}
              >
                <View style={[styles.quickActionIcon, styles.quickActionIconMint]}>
                  <Ionicons name="mic-outline" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>Voice log</Text>
                  <Text style={styles.quickActionSubtitle}>Speak your meal</Text>
                </View>
              </Pressable>

              <Pressable onPress={() => router.push("/(tabs)/profile")} style={styles.quickActionChip}>
                <View style={[styles.quickActionIcon, styles.quickActionIconSlate]}>
                  <Ionicons name="document-text-outline" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>Upload record</Text>
                  <Text style={styles.quickActionSubtitle}>Add health report</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/insights", params: { compareMode: "friends" } })}
                style={styles.quickActionChip}
              >
                <View style={[styles.quickActionIcon, styles.quickActionIconGold]}>
                  <Ionicons name="people-outline" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>Compare friend</Text>
                  <Text style={styles.quickActionSubtitle}>View shared insights</Text>
                </View>
              </Pressable>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function formatMealTypeLabel(mealType: string) {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 3
  },
  hero: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: palette.border
  },
  eyebrow: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
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
  glanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md
  },
  glanceCard: {
    width: "47%",
    minWidth: 0,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    overflow: "hidden"
  },
  glanceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  glanceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  glanceOrange: {
    backgroundColor: "#F97316"
  },
  glanceGreen: {
    backgroundColor: "#14B8A6"
  },
  glanceViolet: {
    backgroundColor: "#8B5CF6"
  },
  glanceCyan: {
    backgroundColor: "#0EA5E9"
  },
  glanceLabel: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "600"
  },
  glanceValue: {
    color: palette.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800"
  },
  glanceDetail: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19
  },
  glanceSubMetric: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "600"
  },
  glanceAccent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4
  },
  glanceAccentOrange: {
    backgroundColor: "#F97316"
  },
  glanceAccentGreen: {
    backgroundColor: "#14B8A6"
  },
  glanceAccentViolet: {
    backgroundColor: "#8B5CF6"
  },
  glanceAccentCyan: {
    backgroundColor: "#0EA5E9"
  },
  progressPanel: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  actionSpotlight: {
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: "#1D4ED8",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3
  },
  actionSpotlightGradient: {
    padding: spacing.xl,
    gap: spacing.md
  },
  actionSpotlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  actionSpotlightEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: spacing.sm,
    paddingVertical: 8
  },
  actionSpotlightEyebrowText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  actionSpotlightArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF"
  },
  actionSpotlightTitle: {
    color: palette.textPrimary,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800"
  },
  actionSpotlightDetail: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 24
  },
  actionSpotlightFooter: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#DBEAFE"
  },
  actionSpotlightCta: {
    color: palette.primary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  actionSpotlightMemory: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    lineHeight: 18
  },
  twoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  singleColumn: {
    flexDirection: "column",
    flexWrap: "nowrap"
  },
  card: {
    flex: 1,
    minWidth: 220,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  fullWidthCard: {
    flexBasis: "100%",
    minWidth: 0
  },
  cardTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700"
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  weekLabel: {
    width: 44,
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  weekBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    overflow: "hidden"
  },
  weekBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.primary
  },
  weekValue: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700",
    width: 72,
    textAlign: "right"
  },
  insightPillWrap: {
    gap: spacing.sm
  },
  insightPill: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FBFF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  insightPillWarn: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB"
  },
  insightPillLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  insightPillText: {
    color: palette.textPrimary,
    fontSize: typography.body,
    lineHeight: 22
  },
  stack: {
    gap: spacing.md
  },
  recentMealRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border
  },
  recentMealRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0
  },
  recentMealCopy: {
    flex: 1,
    gap: spacing.xs
  },
  recentMealTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  recentMealMeta: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  recentMealCalories: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  listText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  hydrationCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  hydrationTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  hydrationInfo: {
    flex: 1,
    gap: spacing.xs
  },
  hydrationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  hydrationGlassBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  hydrationGlassBadgeText: {
    color: "#FFFFFF",
    fontSize: typography.caption,
    fontWeight: "800"
  },
  hydrationRemaining: {
    color: palette.primary,
    fontSize: typography.label,
    fontWeight: "800",
    textAlign: "right"
  },
  hydrationPrimaryValue: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  hydrationMetaLine: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  hydrationAddButton: {
    width: 88,
    borderRadius: 24,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    gap: 4
  },
  hydrationAddButtonText: {
    color: "#FFFFFF",
    fontSize: typography.caption,
    fontWeight: "800"
  },
  hydrationMiniProgressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden"
  },
  hydrationMiniProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.primary
  },
  hydrationTargetHint: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  hydrationCountValue: {
    color: palette.primary,
    fontSize: 36,
    fontWeight: "800"
  },
  hydrationPrimaryAddDisabled: {
    opacity: 0.7
  },
  hydrationHistoryCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    gap: spacing.sm
  },
  hydrationHistoryTitle: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  hydrationHistoryChipList: {
    gap: spacing.sm
  },
  hydrationHistoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  hydrationHistoryChipText: {
    flex: 1,
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  hydrationChipDeleteButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  hydrationEmptyText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  quickActionPanel: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg
  },
  quickActionGrid: {
    gap: spacing.md
  },
  quickActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  quickActionCopy: {
    flex: 1,
    gap: 2
  },
  quickActionTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  quickActionSubtitle: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  quickActionIconWarm: {
    backgroundColor: "#F97316"
  },
  quickActionIconLavender: {
    backgroundColor: "#A855F7"
  },
  quickActionIconSky: {
    backgroundColor: "#0EA5E9"
  },
  quickActionIconMint: {
    backgroundColor: "#14B8A6"
  },
  quickActionIconSlate: {
    backgroundColor: "#475569"
  },
  quickActionIconGold: {
    backgroundColor: "#F59E0B"
  }
});
