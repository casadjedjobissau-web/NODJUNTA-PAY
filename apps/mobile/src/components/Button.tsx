import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, fontSizes, fontWeights, radius, spacing } from "../design/tokens";

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

export function Button({ title, onPress, loading = false, disabled = false, variant = "primary" }: Props) {
  const inactive = disabled || loading;
  const primary = variant === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <Text style={styles.label}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.brand },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
});
