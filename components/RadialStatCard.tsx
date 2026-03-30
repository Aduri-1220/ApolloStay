import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function RadialStatCard({
  label,
  value,
  detail,
  accent
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.ring, { borderColor: accent }]}>
        <Text style={styles.value}>{value}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 155,
    flexGrow: 1,
    alignItems: "center",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm
  },
  ring: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  value: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  label: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  detail: {
    color: palette.textMuted,
    fontSize: typography.caption,
    textAlign: "center",
    lineHeight: 18
  }
});
