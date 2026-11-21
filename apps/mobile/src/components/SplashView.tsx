import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from "react-native";
import { Logo } from "../design/Logo";
import { WovenBand } from "../design/WovenBand";
import { colors, spacing } from "../design/tokens";

export function SplashView() {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.root} accessible accessibilityLabel="A carregar a NODJUNTA-PAY">
      <View style={styles.center}>
        <Logo size={72} tone="onDark" />
        <ActivityIndicator color={colors.brand} />
      </View>
      <WovenBand width={width} cell={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse, justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
});
