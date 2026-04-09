import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function LoadingCard({ label }: { label: string }) {
  return (
    <View style={styles.card}>
      <ActivityIndicator color={palette.accent} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export function ErrorCard({ message }: { message: string }) {
  const normalizedMessage = String(message || "").trim();
  const sanitizedMessage =
    !normalizedMessage || normalizedMessage === '{"error":""}' || normalizedMessage === '{"error":""}\n'
      ? "Please try again in a moment."
      : normalizedMessage;
  const isConnectionIssue = /timeout|connection|reach the server|network|request failed/i.test(normalizedMessage);

  return (
    <View style={styles.card}>
      <Text style={styles.errorTitle}>{isConnectionIssue ? "Connection issue" : "Something went wrong"}</Text>
      <Text style={styles.text}>{sanitizedMessage}</Text>
    </View>
  );
}

export function EmptyCard({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.text}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm
  },
  errorTitle: {
    color: palette.error,
    fontSize: typography.label,
    fontWeight: "700"
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  text: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  }
});
