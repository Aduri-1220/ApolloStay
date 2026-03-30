import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function StreakBanner({ days, focus }: { days: number; focus: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.days}>{days} day streak</Text>
      <Text style={styles.focus}>{focus}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1B2E28",
    borderWidth: 1,
    borderColor: "rgba(109,224,255,0.18)",
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.xs
  },
  days: {
    color: "#6DE0FF",
    fontSize: typography.h2,
    fontWeight: "800"
  },
  focus: {
    color: palette.textPrimary,
    fontSize: typography.body
  }
});
