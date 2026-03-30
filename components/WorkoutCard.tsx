import { StyleSheet, Text, View } from "react-native";
import { WorkoutPlanItem } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function WorkoutCard({ workout }: { workout: WorkoutPlanItem }) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.day}>{workout.day}</Text>
        <Text style={styles.duration}>{workout.duration}</Text>
      </View>
      <Text style={styles.title}>{workout.title}</Text>
      <Text style={styles.description}>{workout.description}</Text>
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
    gap: spacing.xs
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  day: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  duration: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  description: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  }
});
