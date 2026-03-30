import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

type Point = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  subtitle: string;
  points: Point[];
  color: string;
  unit: string;
};

type Summary = {
  max: number;
  min: number;
  latest: number;
  average: number;
  total: number;
  deltaFromAverage: number;
  topLabel: string;
  lowLabel: string;
  guideTop: number;
  guideMiddle: number;
  guideBottom: number;
} | null;

function formatMetricValue(value: number, unit: string) {
  return `${Math.round(value)}${unit}`;
}

function formatDelta(value: number, unit: string) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}${unit}`;
}

function buildSummary(points: Point[]): Summary {
  if (!points.length) {
    return null;
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = total / values.length;
  const latest = values[values.length - 1] || 0;
  const topPoint = points.reduce((best, point) => (point.value >= best.value ? point : best), points[0]);
  const lowPoint = points.reduce((best, point) => (point.value <= best.value ? point : best), points[0]);
  const paddedMax = max + Math.max(max * 0.1, 1);
  const paddedMin = min <= 0 ? 0 : Math.max(0, min - max * 0.05);
  const guideTop = Math.ceil(paddedMax / 50) * 50 || 50;
  const guideBottom = paddedMin <= 0 ? 0 : Math.floor(paddedMin / 50) * 50;
  const guideMiddle = Math.round((guideTop + guideBottom) / 2);

  return {
    max,
    min,
    latest,
    average,
    total,
    deltaFromAverage: latest - average,
    topLabel: topPoint.label,
    lowLabel: lowPoint.label,
    guideTop,
    guideMiddle,
    guideBottom
  };
}

export function MetricsTrendChart({ title, subtitle, points, color, unit }: Props) {
  const summary = useMemo(() => buildSummary(points), [points]);

  if (!summary || points.length === 0) {
    return null;
  }

  const { average, latest, min, max, total, deltaFromAverage, topLabel, lowLabel, guideTop, guideMiddle, guideBottom } = summary;
  const range = Math.max(guideTop - guideBottom, 1);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={[styles.latestBadge, { borderColor: `${color}33`, backgroundColor: `${color}14` }]}>
          <Text style={[styles.latestValue, { color }]}>{formatMetricValue(latest, unit)}</Text>
          <Text style={styles.latestLabel}>Latest</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Average</Text>
          <Text style={styles.summaryValue}>{formatMetricValue(average, unit)}</Text>
          <Text style={[styles.summaryDelta, { color: deltaFromAverage >= 0 ? palette.warning : palette.success }]}>
            {formatDelta(deltaFromAverage, unit)} vs latest
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Highest</Text>
          <Text style={styles.summaryValue}>{formatMetricValue(max, unit)}</Text>
          <Text style={styles.summaryHint}>{topLabel}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Lowest</Text>
          <Text style={styles.summaryValue}>{formatMetricValue(min, unit)}</Text>
          <Text style={styles.summaryHint}>{lowLabel}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>7-day total</Text>
          <Text style={styles.summaryValue}>{formatMetricValue(total, unit)}</Text>
          <Text style={styles.summaryHint}>Across the week</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartHeaderTitle}>Daily breakdown</Text>
          <Text style={styles.chartHeaderMeta}>Bars show each day, dotted line shows average</Text>
        </View>

        <View style={styles.chartShell}>
          <View style={styles.chartGuides}>
            <Text style={styles.guideLabel}>
              {guideTop}
              {unit}
            </Text>
            <Text style={styles.guideLabel}>
              {guideMiddle}
              {unit}
            </Text>
            <Text style={styles.guideLabel}>
              {guideBottom}
              {unit}
            </Text>
          </View>

          <View style={styles.chartBody}>
            <View style={styles.gridTop} />
            <View style={styles.gridMiddle} />
            <View style={styles.gridBottom} />
            <View
              style={[
                styles.averageGuide,
                {
                  bottom: `${((average - guideBottom) / range) * 100}%`
                }
              ]}
            />

            <View style={styles.columnsRow}>
              {points.map((point, index) => {
                const normalizedHeight = ((Math.max(point.value, guideBottom) - guideBottom) / range) * 100;
                const heightPercent = Math.max(10, normalizedHeight);
                const selected = index === points.length - 1;
                const aboveAverage = point.value >= average;

                return (
                  <View key={`${point.label}-${index}`} style={styles.columnWrap}>
                    <Text style={[styles.columnValueTop, selected && { color }]}>
                      {Math.round(point.value)}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.min(100, heightPercent)}%`,
                            backgroundColor: selected ? color : aboveAverage ? `${color}88` : `${color}40`
                          }
                        ]}
                      />
                      <View
                        style={[
                          styles.barCap,
                          {
                            bottom: `${Math.min(100, heightPercent)}%`,
                            borderColor: selected ? color : `${color}88`
                          }
                        ]}
                      />
                    </View>
                    <Text style={styles.dayLabel}>{point.label}</Text>
                    <Text style={[styles.dayValue, selected && { color }]}>
                      {point.value >= average ? "Above avg" : "Below avg"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: color }]} />
            <Text style={styles.legendText}>Daily total</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendDash} />
            <Text style={styles.legendText}>Weekly average</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800"
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  latestBadge: {
    minWidth: 108,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "flex-end",
    gap: 2
  },
  latestValue: {
    fontSize: typography.h3,
    fontWeight: "800"
  },
  latestLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4
  },
  summaryLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  summaryValue: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  summaryHint: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  summaryDelta: {
    fontSize: typography.caption,
    fontWeight: "700"
  },
  chartCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.md
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md
  },
  chartHeaderTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  chartHeaderMeta: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "600",
    flex: 1,
    textAlign: "right"
  },
  chartShell: {
    flexDirection: "row",
    gap: spacing.sm
  },
  chartGuides: {
    width: 58,
    justifyContent: "space-between",
    paddingBottom: 42,
    paddingTop: spacing.sm
  },
  guideLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    textAlign: "right"
  },
  chartBody: {
    flex: 1,
    height: 270,
    justifyContent: "flex-end",
    position: "relative",
    paddingTop: spacing.sm
  },
  gridTop: {
    position: "absolute",
    top: spacing.sm,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: palette.border
  },
  gridMiddle: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: palette.border
  },
  gridBottom: {
    position: "absolute",
    bottom: 46,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: palette.border
  },
  averageGuide: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderColor: "#94A3B8",
    borderStyle: "dashed"
  },
  columnsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.xs,
    flex: 1
  },
  columnWrap: {
    flex: 1,
    alignItems: "center",
    gap: 8
  },
  columnValueTop: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  barTrack: {
    width: "100%",
    maxWidth: 34,
    minHeight: 150,
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#EAF1FB",
    borderRadius: 999,
    overflow: "hidden",
    position: "relative"
  },
  barFill: {
    width: "100%",
    borderRadius: 999
  },
  barCap: {
    position: "absolute",
    left: "50%",
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 4,
    backgroundColor: "#FFFFFF"
  },
  dayLabel: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  dayValue: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center"
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999
  },
  legendDash: {
    width: 14,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: "#94A3B8"
  },
  legendText: {
    color: palette.textMuted,
    fontSize: typography.caption
  }
});
