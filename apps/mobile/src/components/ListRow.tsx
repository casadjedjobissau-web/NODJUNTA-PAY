import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../design/tokens";

interface Props {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}

export function ListRow({ title, subtitle, left, right, onPress, last = false }: Props) {
  const body = (
    <>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        onPress={onPress}
        style={({ pressed }) => [styles.row, last ? null : styles.divider, pressed ? styles.pressed : null]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[styles.row, last ? null : styles.divider]}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.7 },
  left: { alignItems: "center", justifyContent: "center" },
  center: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", justifyContent: "center" },
  title: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    color: colors.textSecondary,
  },
});
