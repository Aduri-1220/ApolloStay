import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { palette, radii, spacing, typography } from "@/lib/theme";

type Action = {
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
};

type LogActionSheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: Action[];
  onClose: () => void;
};

export function LogActionSheet(props: LogActionSheetProps) {
  const { visible, title, subtitle, actions, onClose } = props;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.actionList}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={[styles.actionButton, action.tone === "danger" && styles.actionButtonDanger]}
              >
                <Text style={[styles.actionText, action.tone === "danger" && styles.actionTextDanger]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  sheet: {
    backgroundColor: "#10221D",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm
  },
  handle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: spacing.xs
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
  },
  actionList: {
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  actionButton: {
    borderRadius: radii.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md
  },
  actionButtonDanger: {
    borderColor: "rgba(255,122,122,0.18)",
    backgroundColor: "rgba(255,122,122,0.08)"
  },
  actionText: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  actionTextDanger: {
    color: "#FF9E9E"
  },
  cancelButton: {
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md
  },
  cancelText: {
    color: palette.textSubtle,
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "center"
  }
});
