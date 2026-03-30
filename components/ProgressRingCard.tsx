import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function ProgressRingCard({
  label,
  value,
  tint
}: {
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.ring, { borderColor: tint }]}>
        <Text style={styles.number}>{value}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 104,
    flexGrow: 1,
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md
  },
  ring: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 7,
    alignItems: "center",
    justifyContent: "center"
  },
  number: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  label: {
    color: palette.textMuted,
    fontSize: typography.body
  }
});
