import { StyleSheet, Text, View } from "react-native";
import { ProfileMetric } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function ProfileMetricCard({ metric }: { metric: ProfileMetric }) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{metric.value}</Text>
      <Text style={styles.label}>{metric.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs
  },
  value: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  label: {
    color: palette.textMuted,
    fontSize: typography.caption
  }
});
