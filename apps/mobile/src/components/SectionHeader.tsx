import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../design/tokens";

interface Props {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no" />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} hitSlop={10}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  bar: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.brand },
  title: {
    fontSize: fontSizes.bodyLarge,
    lineHeight: lineHeights.bodyLarge,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  action: { fontSize: fontSizes.small, fontWeight: fontWeights.bold, color: colors.link },
});
