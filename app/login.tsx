import { useState } from "react";
import { Redirect } from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { ErrorCard } from "@/components/AsyncState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";
import { palette, radii, spacing, typography } from "@/lib/theme";

export default function LoginScreen() {
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    return <Redirect href="/onboarding" />;
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (mode === "login") {
        await signIn({ email, password });
      } else {
        await signUp({ name, email, password });
      }
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.badge}>ApolloStay account</Text>
          <Text style={styles.title}>{mode === "login" ? "Log in" : "Create your account"}</Text>
          <Text style={styles.subtitle}>
            Your logs, records, recommendations, and insights will be scoped to your own signed-in profile.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.modeRow}>
            <Text onPress={() => setMode("login")} style={[styles.modeText, mode === "login" && styles.modeTextActive]}>
              Log in
            </Text>
            <Text
              onPress={() => setMode("register")}
              style={[styles.modeText, mode === "register" && styles.modeTextActive]}
            >
              Register
            </Text>
          </View>

          {mode === "register" ? (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={palette.textSubtle}
              style={styles.input}
            />
          ) : null}
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={palette.textSubtle}
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={palette.textSubtle}
            style={styles.input}
          />
          {error ? <ErrorCard message={error} /> : null}
          <PrimaryButton label={submitting ? "Please wait..." : mode === "login" ? "Log in" : "Create account"} onPress={handleSubmit} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.lg
  },
  hero: {
    gap: spacing.sm
  },
  badge: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  title: {
    color: palette.textPrimary,
    fontSize: 38,
    fontWeight: "800"
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 24
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.xs
  },
  modeText: {
    color: palette.textSubtle,
    fontSize: typography.label,
    fontWeight: "700"
  },
  modeTextActive: {
    color: palette.textPrimary
  },
  input: {
    backgroundColor: palette.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  }
});
