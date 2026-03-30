import { Pressable, StyleSheet, Text, View } from "react-native";
import { Meal } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

function displayValue(value: number | null, unit: string) {
  return value === null ? "Unavailable" : `${value}${unit}`;
}

export function MealCard({
  meal,
  actions,
  onPress,
  hint
}: {
  meal: Meal;
  actions?: Array<{ label: string; onPress: () => void; tone?: "default" | "danger" }>;
  onPress?: () => void;
  hint?: string;
}) {
  const Container = onPress ? Pressable : View;

  return (
    <Container style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.name}>{meal.name}</Text>
        <Text style={styles.calories}>{displayValue(meal.calories, " kcal")}</Text>
      </View>
      <Text style={styles.detail}>{meal.time}</Text>
      {meal.note ? <Text style={styles.note}>{meal.note}</Text> : null}
      <Text style={styles.meta}>
        Protein {displayValue(meal.protein, "g")} • Carbs {displayValue(meal.carbs, "g")} • Fat{" "}
        {displayValue(meal.fat, "g")}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {actions && actions.length > 0 ? (
        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={[styles.actionButton, action.tone === "danger" && styles.actionButtonDanger]}
            >
              <Text style={[styles.actionText, action.tone === "danger" && styles.actionTextDanger]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.xs
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    alignItems: "flex-start"
  },
  name: {
    flex: 1,
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  calories: {
    color: palette.accent,
    fontSize: typography.label,
    fontWeight: "700",
    flexShrink: 0
  },
  detail: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  note: {
    color: palette.accent,
    fontSize: typography.caption,
    lineHeight: 18
  },
  meta: {
    color: palette.textMuted,
    fontSize: typography.body
  },
  hint: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    marginTop: spacing.xs
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  actionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  actionButtonDanger: {
    borderColor: "rgba(255,122,122,0.18)",
    backgroundColor: "rgba(255,122,122,0.08)"
  },
  actionText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  actionTextDanger: {
    color: "#FF9E9E"
  }
});
