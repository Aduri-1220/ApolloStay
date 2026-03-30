import { Pressable, StyleSheet, Text } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

export function PrimaryButton({
  label,
  onPress,
  disabled
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: palette.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center"
  },
  pressed: {
    opacity: 0.88
  },
  disabled: {
    opacity: 0.55
  },
  label: {
    color: "#FFFFFF",
    fontSize: typography.label,
    fontWeight: "800"
  }
});
