import { StyleSheet, Text, View } from "react-native";
import { initialsFromName } from "../design/initials";
import { avatarTone } from "../design/tones";
import { fontWeights } from "../design/tokens";

interface Props {
  name?: string | null;
  seed?: string;
  size?: number;
}

export function Avatar({ name, seed, size = 44 }: Props) {
  const tone = avatarTone(seed ?? name ?? "");
  const initials = initialsFromName(name);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg },
      ]}
    >
      <Text style={[styles.text, { color: tone.fg, fontSize: Math.round(size * 0.38) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  text: { fontWeight: fontWeights.bold },
});
