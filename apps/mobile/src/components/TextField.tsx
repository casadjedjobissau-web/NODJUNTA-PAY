import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, fontSizes, fontWeights, lineHeights, radius, spacing } from "../design/tokens";

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  prefix?: string;
  hint?: string;
}

export function TextField({ label, error, prefix, hint, style, onFocus, onBlur, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.brand : colors.border;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, { borderColor }]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, style]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...inputProps}
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    borderWidth: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  prefix: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  input: {
    flex: 1,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  error: { fontSize: fontSizes.small, lineHeight: lineHeights.small, color: colors.error },
  hint: { fontSize: fontSizes.small, lineHeight: lineHeights.small, color: colors.textSecondary },
});
