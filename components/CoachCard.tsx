import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function CoachCard({ note }: { note: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Coach insight</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#13251F",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(212,255,112,0.16)",
    padding: spacing.lg,
    gap: spacing.sm
  },
  kicker: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  note: {
    color: palette.textPrimary,
    fontSize: typography.body,
    lineHeight: 24
  }
});
