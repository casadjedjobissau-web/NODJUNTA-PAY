import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { BrandHeader } from "../../components/BrandHeader";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import type { IconName } from "../../design/icons";
import { BijagosScene } from "../../design/LandscapeArt";
import { colors, fontSizes, lineHeights, radius, spacing } from "../../design/tokens";
import { markWelcomeSeen } from "../../lib/onboarding";
import { secureStorage } from "../../lib/secure-storage";

const FEATURES: ReadonlyArray<{ icon: IconName; text: string }> = [
  { icon: "send", text: "Envie dinheiro a quem usa a NODJUNTA-PAY, só com o número de telemóvel." },
  { icon: "qr", text: "Pague nas lojas lendo um QR Code." },
  { icon: "shield", text: "Confirme cada operação com o seu PIN de 6 dígitos." },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contentWidth = width - spacing.lg * 2;

  async function onStart() {
    await markWelcomeSeen(secureStorage);
    router.replace("/phone");
  }

  return (
    <Screen>
      <View style={styles.rounded}>
        <BrandHeader
          title="Bem-vindo à NODJUNTA-PAY"
          subtitle="Envie, receba e pague com o seu telemóvel, de forma simples e segura."
        />
      </View>

      <View style={styles.rounded}>
        <BijagosScene width={contentWidth} label="Ilustração do arquipélago dos Bijagós" />
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature.icon} style={styles.feature}>
            <Icon name={feature.icon} size={24} color={colors.brandText} />
            <Text style={styles.featureText}>{feature.text}</Text>
          </View>
        ))}
      </View>

      <Button title="Começar" onPress={() => void onStart()} />
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
