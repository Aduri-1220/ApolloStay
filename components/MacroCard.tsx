import { StyleSheet, Text, View } from "react-native";
import { MacroTarget } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function MacroCard({ macro }: { macro: MacroTarget }) {
  return (
    <View style={styles.card}>
      <View>
        <Text style={styles.label}>{macro.label}</Text>
        <Text style={styles.value}>{macro.value}</Text>
      </View>
      <Text style={styles.detail}>{macro.detail}</Text>
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
    gap: spacing.sm
  },
  label: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5
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
