import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, shadows, spacing } from "../design/tokens";

type CardTone = "light" | "dark" | "brand";

interface Props {
  children: ReactNode;
  tone?: CardTone;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, tone = "light", padded = true, style }: Props) {
  return (
    <View style={[styles.base, toneStyles[tone], padded ? styles.padded : null, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, overflow: "hidden" },
  padded: { padding: spacing.lg, gap: spacing.sm },
});

const toneStyles = StyleSheet.create({
  light: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  dark: { backgroundColor: colors.surfaceInverse },
  brand: { backgroundColor: colors.brand },
});
