import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { BrandHeader } from "../../components/BrandHeader";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import type { IconName } from "../../design/icons";
import { BijagosScene } from "../../design/LandscapeArt";
import { colors, fontSizes, lineHeights, radius, spacing } from "../../design/tokens";
import { useI18n } from "../../lib/i18n/language";
import type { MessageKey } from "../../lib/i18n/messages";
import { markWelcomeSeen } from "../../lib/onboarding";
import { secureStorage } from "../../lib/secure-storage";

const FEATURES: ReadonlyArray<{ icon: IconName; key: MessageKey }> = [
  { icon: "send", key: "welcome.feature.send" },
  { icon: "qr", key: "welcome.feature.qr" },
  { icon: "shield", key: "welcome.feature.pin" },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const contentWidth = width - spacing.lg * 2;

  async function onStart() {
    await markWelcomeSeen(secureStorage);
    router.replace("/phone");
  }

  return (
    <Screen>
      <View style={styles.rounded}>
        <BrandHeader title={t("welcome.title")} subtitle={t("welcome.subtitle")} />
      </View>

      <View style={styles.rounded}>
        <BijagosScene width={contentWidth} label={t("welcome.illustration")} />
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature.icon} style={styles.feature}>
            <Icon name={feature.icon} size={24} color={colors.brandText} />
            <Text style={styles.featureText}>{t(feature.key)}</Text>
          </View>
        ))}
      </View>

      <Button title={t("welcome.start")} onPress={() => void onStart()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rounded: { borderRadius: radius.lg, overflow: "hidden" },
  features: { gap: spacing.md },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureText: {
    flex: 1,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    color: colors.textPrimary,
  },
});
