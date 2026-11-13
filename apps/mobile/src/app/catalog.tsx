import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Redirect } from "expo-router";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { BrandHeader } from "../components/BrandHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { ListRow } from "../components/ListRow";
import { ResultCard } from "../components/ResultCard";
import { Screen } from "../components/Screen";
import { SectionHeader } from "../components/SectionHeader";
import { Skeleton } from "../components/Skeleton";
import { TextField } from "../components/TextField";
import { config } from "../config";
import { contrastRatio } from "../design/contrast";
import { BijagosScene, MangroveScene } from "../design/LandscapeArt";
import { FortressScene, MonumentScene } from "../design/HeritageArt";
import { ICON_NAMES } from "../design/icons";
import { Logo } from "../design/Logo";
import { colors, fontSizes, fontWeights, lineHeights, palette, radius, spacing, textPairs } from "../design/tokens";
import { WovenBand } from "../design/WovenBand";
import type { Tone } from "../design/tones";

const TONES: Tone[] = ["neutral", "success", "info", "warning", "error"];

const SWATCHES: Array<{ name: string; hex: string; dark: boolean }> = [
  { name: "Verde", hex: palette.green, dark: false },
  { name: "Preto", hex: palette.ink, dark: true },
  { name: "Branco", hex: palette.white, dark: false },
  { name: "Azul", hex: palette.blue, dark: true },
];

function Catalog() {
  const { width } = useWindowDimensions();
  const contentWidth = width - spacing.lg * 2;
  const [text, setText] = useState("");

  return (
    <Screen>
      <BrandHeader title="Catálogo do design" subtitle="Elementos para aprovação" />

      <SectionHeader title="Cores da marca" />
      <View style={styles.swatchRow}>
        {SWATCHES.map((swatch) => (
          <View key={swatch.name} style={[styles.swatch, { backgroundColor: swatch.hex }]}>
            <Text style={[styles.swatchText, { color: swatch.dark ? palette.white : palette.ink }]}>
              {swatch.name}
            </Text>
            <Text style={[styles.swatchHex, { color: swatch.dark ? palette.white : palette.ink }]}>
              {swatch.hex}
            </Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Combinações de texto (contraste)" />
      {textPairs.map((pair) => (
        <View key={pair.name} style={[styles.pair, { backgroundColor: pair.bg }]}>
          <Text style={[styles.pairText, { color: pair.fg }]}>{pair.name}</Text>
          <Text style={[styles.pairRatio, { color: pair.fg }]}>
            {contrastRatio(pair.fg, pair.bg).toFixed(2).replace(".", ",")}:1
          </Text>
        </View>
      ))}

      <SectionHeader title="Logótipo" />
      <Card>
        <Logo size={56} />
      </Card>
      <Card tone="dark">
        <Logo size={56} tone="onDark" />
      </Card>

      <SectionHeader title="Faixa tecida" />
      <WovenBand width={contentWidth} cell={16} />

      <SectionHeader title="Botões" />
      <Button title="Ação principal" onPress={() => undefined} />
      <Button title="Ação secundária" onPress={() => undefined} variant="secondary" />
      <Button title="A carregar" onPress={() => undefined} loading />
      <Button title="Desativado" onPress={() => undefined} disabled />

      <SectionHeader title="Campos de texto" />
      <TextField label="Normal" value={text} onChangeText={setText} placeholder="Escreva aqui" hint="Texto de ajuda" />
      <TextField label="Com prefixo" prefix="+245" value="" onChangeText={() => undefined} placeholder="9XX XXX XXX" />
      <TextField label="Com erro" value="12" onChangeText={() => undefined} error="Valor inválido." />

      <SectionHeader title="Etiquetas" />
      <View style={styles.row}>
        {TONES.map((tone) => (
          <Badge key={tone} label={tone} tone={tone} />
        ))}
      </View>

      <SectionHeader title="Avatares" />
      <View style={styles.row}>
        <Avatar name="Maria Gomes" />
        <Avatar name="João Pereira" />
        <Avatar name="Fatumata" />
        <Avatar name="Ana Maria da Silva" size={56} />
        <Avatar name={null} />
      </View>

      <SectionHeader title="Cartões" actionLabel="Ver tudo" onAction={() => undefined} />
      <Card>
        <Text style={styles.cardText}>Cartão claro</Text>
      </Card>
      <Card tone="dark">
        <Text style={[styles.cardText, { color: colors.textOnInverse }]}>Cartão escuro</Text>
      </Card>
      <Card tone="brand">
        <Text style={[styles.cardText, { color: colors.textOnBrand }]}>Cartão verde (texto preto)</Text>
      </Card>

      <SectionHeader title="Lista" />
      <Card padded={false} style={styles.listCard}>
        <ListRow title="Transferências" subtitle="Enviar dinheiro" left={<Icon name="send" />} onPress={() => undefined} />
        <ListRow title="Segurança" subtitle="PIN e verificação" left={<Icon name="shield" />} onPress={() => undefined} />
        <ListRow title="Suporte" left={<Icon name="support" />} onPress={() => undefined} last />
      </Card>

      <SectionHeader title="Carregamento" />
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} />
      <Skeleton height={14} width="80%" />

      <SectionHeader title="Resultado" />
      <ResultCard
        title="Operação concluída"
        lines={[
          { label: "Valor", value: "5 000 XOF" },
          { label: "Referência", value: "A1B2C3D4" },
        ]}
        buttonLabel="Concluir"
        onDone={() => undefined}
      />

      <SectionHeader title="Ícones" />
      <View style={styles.iconGrid}>
        {ICON_NAMES.map((name) => (
          <View key={name} style={styles.iconCell}>
            <Icon name={name} size={28} />
            <Text style={styles.iconName}>{name}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Ilustrações" />
      <MangroveScene width={contentWidth} label="Mangal" />
      <BijagosScene width={contentWidth} label="Arquipélago dos Bijagós" />
      <FortressScene width={contentWidth} label="Fortaleza de São José da Amura" />
      <MonumentScene width={contentWidth * 0.6} label="Silhueta de monumento" />
      <MangroveScene width={contentWidth} variant="light" label="Mangal, versão clara" />
    </Screen>
  );
}

export default function CatalogGate() {
  if (!__DEV__ && !config.sandboxTools) {
    return <Redirect href="/" />;
  }
  return <Catalog />;
}

const styles = StyleSheet.create({
  swatchRow: { flexDirection: "row", gap: spacing.sm },
  swatch: {
    flex: 1,
    minHeight: 84,
    borderRadius: radius.md,
    padding: spacing.sm,
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchText: { fontSize: fontSizes.small, fontWeight: fontWeights.bold },
  swatchHex: { fontSize: fontSizes.caption },
  pair: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pairText: { fontSize: fontSizes.small, flexShrink: 1 },
  pairRatio: { fontSize: fontSizes.small, fontWeight: fontWeights.bold },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  cardText: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  listCard: { paddingHorizontal: spacing.md },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  iconCell: { width: 76, alignItems: "center", gap: 4, paddingVertical: spacing.sm },
  iconName: { fontSize: fontSizes.caption, color: colors.textSecondary },
});
