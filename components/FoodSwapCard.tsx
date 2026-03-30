import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";
import { FoodSwap } from "@/lib/types";

export function FoodSwapCard({ swap }: { swap: FoodSwap }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{swap.current}</Text>
      <Text style={styles.arrow}>swap to</Text>
      <Text style={styles.target}>{swap.better}</Text>
      <Text style={styles.meta}>{swap.reason}</Text>
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
    gap: 6
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  arrow: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  target: {
    color: palette.accent,
    fontSize: typography.body,
    fontWeight: "700"
  },
  meta: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  }
});
