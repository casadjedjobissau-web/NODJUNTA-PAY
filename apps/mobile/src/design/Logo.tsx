import { StyleSheet, Text, View } from "react-native";
import Svg, { Polygon, Rect } from "react-native-svg";
import { pointsToString, starPoints } from "./patterns";
import { colors, fontWeights, palette } from "./tokens";

interface MarkProps {
  size: number;
}

export function LogoMark({ size }: MarkProps) {
  const star = pointsToString(starPoints(50, 46, 28, 11.2));
  const diamonds = [36, 50, 64].map((cx) =>
    pointsToString([
      { x: cx, y: 80 },
      { x: cx + 4.5, y: 84.5 },
      { x: cx, y: 89 },
      { x: cx - 4.5, y: 84.5 },
    ]),
  );

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityRole="image"
      accessibilityLabel="NODJUNTA-PAY"
    >
      <Rect x={0} y={0} width={100} height={100} rx={24} fill={palette.green} />
      <Polygon points={star} fill={palette.ink} />
      {diamonds.map((points) => (
        <Polygon key={points} points={points} fill={palette.white} />
      ))}
    </Svg>
  );
}

interface LogoProps {
  size?: number;
  tone?: "onLight" | "onDark";
  showWordmark?: boolean;
}

export function Logo({ size = 48, tone = "onLight", showWordmark = true }: LogoProps) {
  const textColor = tone === "onDark" ? colors.textOnInverse : colors.textPrimary;
  const fontSize = Math.round(size * 0.42);

  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="NODJUNTA-PAY">
      <LogoMark size={size} />
      {showWordmark ? (
        <Text style={[styles.word, { color: textColor, fontSize }]} accessibilityElementsHidden>
          NODJUNTA<Text style={styles.light}>-PAY</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  word: { fontWeight: fontWeights.heavy, letterSpacing: 1.2 },
  light: { fontWeight: fontWeights.regular },
});
