import { StyleSheet, Text, View } from "react-native";
import { palette, spacing, typography } from "@/lib/theme";

export function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 98,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  value: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  label: {
    color: palette.textSubtle,
    fontSize: typography.caption
  }
});
