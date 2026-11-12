import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, fontSize, radius, spacing } from "../theme";

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  prefix?: string;
}

export function TextField({ label, error, prefix, style, ...inputProps }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...inputProps}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: "600" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  fieldError: { borderColor: colors.danger },
  prefix: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: "600" },
  input: { flex: 1, fontSize: fontSize.body, color: colors.text, paddingVertical: spacing.sm },
  error: { fontSize: fontSize.small, color: colors.danger },
});
