import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, fontSizes, fontWeights, lineHeights, palette, spacing } from "../design/tokens";
import { Button } from "./Button";
import { Card } from "./Card";

interface Line {
  label: string;
  value: string;
}

interface Props {
  title: string;
  lines: Line[];
  note?: string;
  buttonLabel: string;
  onDone: () => void;
}

function CheckMark() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={56} height={56} viewBox="0 0 56 56">
        <Circle cx={28} cy={28} r={28} fill={palette.green} />
        <Path
          d="M16 29 L25 38 L41 20"
          stroke={palette.ink}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

export function ResultCard({ title, lines, note, buttonLabel, onDone }: Props) {
  return (
    <View style={styles.wrapper}>
      <Card>
        <CheckMark />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {lines.map((line) => (
          <View key={line.label} style={styles.line}>
            <Text style={styles.label}>{line.label}</Text>
            <Text style={styles.value}>{line.value}</Text>
          </View>
        ))}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </Card>
      <Button title={buttonLabel} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  title: {
    fontSize: fontSizes.title,
    lineHeight: lineHeights.title,
    fontWeight: fontWeights.heavy,
    color: colors.brandText,
    marginTop: spacing.sm,
  },
  line: { gap: 2, marginTop: spacing.xs },
  label: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  value: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    color: colors.textPrimary,
    fontWeight: fontWeights.semibold,
  },
  note: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
