import { StyleSheet, Text, View } from "react-native";
import { Trend } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function TrendCard({ trend }: { trend: Trend }) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>{trend.label}</Text>
        <Text style={[styles.delta, { color: trend.positive ? palette.accent : "#FF9E6D" }]}>
          {trend.delta}
        </Text>
      </View>
      <Text style={styles.value}>{trend.value}</Text>
      <Text style={styles.meta}>{trend.note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  label: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  delta: {
    fontSize: typography.caption,
    fontWeight: "700"
  },
  value: {
    color: palette.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800"
  },
  meta: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  }
});
