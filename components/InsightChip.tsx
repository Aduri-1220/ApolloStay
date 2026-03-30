import { StyleSheet, Text, View } from "react-native";
import { palette, spacing, typography } from "@/lib/theme";

export function InsightChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  value: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  label: {
    color: palette.textSubtle,
    fontSize: typography.caption
  }
});
