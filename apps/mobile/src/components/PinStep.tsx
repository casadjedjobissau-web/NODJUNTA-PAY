import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../design/tokens";
import { PinPad } from "./PinPad";
import { Screen } from "./Screen";

interface Props {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
  busy?: boolean;
  children?: ReactNode;
}

export function PinStep({ title, subtitle, value, onChange, error = null, busy = false, children }: Props) {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <PinPad value={value} onChange={onChange} disabled={busy} error={error} />
      {busy ? <ActivityIndicator color={colors.brandText} /> : null}

      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginTop: spacing.md },
  title: {
    fontSize: fontSizes.headline,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.heavy,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    color: colors.textSecondary,
  },
});
