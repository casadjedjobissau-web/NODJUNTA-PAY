import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Logo } from "../design/Logo";
import { WovenBand } from "../design/WovenBand";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../design/tokens";

interface Props {
  title?: string;
  subtitle?: string;
}

export function BrandHeader({ title, subtitle }: Props) {
  const [width, setWidth] = useState(0);

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <View style={styles.body}>
        <Logo size={44} tone="onDark" />
        {title ? (
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {width > 0 ? <WovenBand width={width} cell={12} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surfaceInverse, overflow: "hidden" },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: {
    fontSize: fontSizes.headline,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.heavy,
    color: colors.textOnInverse,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    color: colors.textOnInverse,
  },
});
