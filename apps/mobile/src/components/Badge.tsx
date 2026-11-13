import { StyleSheet, Text, View } from "react-native";
import { TONES, type Tone } from "../design/tones";
import { fontSizes, fontWeights, radius, spacing } from "../design/tokens";

interface Props {
  label: string;
  tone?: Tone;
}

export function Badge({ label, tone = "neutral" }: Props) {
  const colorsForTone = TONES[tone];

  return (
    <View style={[styles.base, { backgroundColor: colorsForTone.bg }]} accessible accessibilityLabel={label}>
      <Text style={[styles.text, { color: colorsForTone.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  text: { fontSize: fontSizes.caption, fontWeight: fontWeights.bold },
});
