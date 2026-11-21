import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, fontWeights, radius, spacing } from "../design/tokens";
import { PIN_LENGTH } from "../lib/pin";
import { PIN_KEYS, pressDelete, pressDigit } from "../lib/pin-entry";

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string | null;
}

const KEY_WIDTH = 76;
const KEY_HEIGHT = 64;

export function PinPad({ value, onChange, disabled = false, error = null }: Props) {
  return (
    <View style={styles.wrapper}>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`${value.length} de ${PIN_LENGTH} dígitos introduzidos`}
        accessibilityLiveRegion="polite"
      >
        {Array.from({ length: PIN_LENGTH }, (_unused, index) => (
          <View
            key={index}
            style={[styles.dot, index < value.length ? styles.dotFilled : null, error ? styles.dotError : null]}
          />
        ))}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={styles.grid}>
        {PIN_KEYS.map((key, index) => {
          if (key === "") {
            return <View key={`blank-${index}`} style={styles.key} />;
          }
          const isDelete = key === "delete";
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={isDelete ? "Apagar o último dígito" : key}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onChange(isDelete ? pressDelete(value) : pressDigit(value, key))}
              style={({ pressed }) => [
                styles.key,
                styles.keyActive,
                pressed && !disabled ? styles.keyPressed : null,
                disabled ? styles.keyDisabled : null,
              ]}
            >
              <Text style={isDelete ? styles.deleteLabel : styles.digit}>{isDelete ? "Apagar" : key}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: spacing.md },
  dots: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: "transparent",
  },
  dotFilled: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  dotError: { borderColor: colors.error },
  error: { fontSize: fontSizes.small, color: colors.error, textAlign: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.md,
    width: KEY_WIDTH * 3 + spacing.md * 2,
  },
  key: { width: KEY_WIDTH, height: KEY_HEIGHT, alignItems: "center", justifyContent: "center" },
  keyActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  keyPressed: { backgroundColor: colors.brandSoft },
  keyDisabled: { opacity: 0.5 },
  digit: { fontSize: fontSizes.title, fontWeight: fontWeights.bold, color: colors.textPrimary },
  deleteLabel: { fontSize: fontSizes.small, fontWeight: fontWeights.bold, color: colors.textSecondary },
});
