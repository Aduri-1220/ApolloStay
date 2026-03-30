import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.xs
  },
  label: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "700"
  },
  value: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  detail: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  }
});
