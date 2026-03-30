import { StyleSheet, Text, View } from "react-native";
import { palette, spacing, typography } from "@/lib/theme";

export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  }
});
