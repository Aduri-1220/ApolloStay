import { StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function ProgressBar({
  label,
  value,
  target,
  color
}: {
  label: string;
  value: number | null;
  target: number | null;
  color: string;
}) {
  const safeValue = typeof value === "number" ? value : 0;
  const safeTarget = typeof target === "number" && target > 0 ? target : null;
  const width = safeTarget ? Math.min((safeValue / safeTarget) * 100, 100) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {typeof value === "number" ? value : "Unavailable"}
          {safeTarget ? ` / ${safeTarget}` : ""}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  label: {
    color: palette.textMuted,
    fontSize: typography.body,
    fontWeight: "600"
  },
  value: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  track: {
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    borderRadius: 999
  }
});
