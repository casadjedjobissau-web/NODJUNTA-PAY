import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../../design/tokens";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import { formatMoney } from "../../lib/money";
import { isUuid, receiptLines, receiptTitle, type ReceiptView } from "../../lib/receipt";
import { receiptHtml } from "../../lib/receipt-html";
import { shareReceipt, type ShareDeps, type ShareFormat } from "../../lib/receipt-share";

const SHARE_MESSAGES = {
  unavailable: "A partilha não está disponível neste telemóvel.",
  failed: "Não foi possível partilhar o recibo. Tente novamente.",
} as const;

export default function ReceiptScreen() {
  const params = useLocalSearchParams<{ transactionId?: string | string[] }>();
  const raw = Array.isArray(params.transactionId) ? params.transactionId[0] : params.transactionId;
  const transactionId = isUuid(raw) ? raw : null;

  const cardRef = useRef<View>(null);
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [loading, setLoading] = useState(transactionId !== null);
  const [error, setError] = useState<string | null>(
    transactionId === null ? "Não foi possível abrir este recibo." : null,
  );
  const [sharing, setSharing] = useState<ShareFormat | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (transactionId === null) {
      return;
    }
    let active = true;
    api
      .request<ReceiptView>(`/v1/receipts/${transactionId}`)
      .then((view) => {
        if (active) {
          setReceipt(view);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(userMessage(err));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [transactionId]);

  async function onShare(format: ShareFormat) {
    if (!receipt) {
      return;
    }
    const deps: ShareDeps = {
      isAvailable: () => Sharing.isAvailableAsync(),
      makePdf: async (html) => (await Print.printToFileAsync({ html })).uri,
      makeImage: () => captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" }),
      share: (uri, options) =>
        Sharing.shareAsync(uri, { mimeType: options.mimeType, dialogTitle: options.dialogTitle, UTI: options.uti }),
    };

    setSharing(format);
    setShareError(null);
    const result = await shareReceipt(deps, format, receiptHtml(receipt), `Recibo ${receipt.receiptNumber}`);
    setSharing(null);
    if (result.status !== "shared") {
      setShareError(SHARE_MESSAGES[result.status]);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brandText} />
      </Screen>
    );
  }

  if (error || !receipt) {
    return (
      <Screen>
        <Text style={styles.error}>{error ?? "Não foi possível abrir este recibo."}</Text>
      </Screen>
    );
  }

  const shown = receipt.direction === "out" ? receipt.total : receipt.amount;

  return (
    <Screen>
      <View ref={cardRef} collapsable={false} style={styles.capture}>
        <Card>
          <Text style={styles.brand}>NODJUNTA-PAY</Text>
          <Text style={styles.title} accessibilityRole="header">
            {receiptTitle(receipt.kind, receipt.direction)}
          </Text>
          <Text style={styles.amount}>{formatMoney(shown, receipt.currency)}</Text>
          {receiptLines(receipt).map((line) => (
            <View key={line.label} style={styles.line}>
              <Text style={styles.label}>{line.label}</Text>
              <Text style={styles.value}>{line.value}</Text>
            </View>
          ))}
          <Text style={styles.note}>
            O número de telemóvel da outra pessoa aparece parcialmente escondido, por privacidade.
          </Text>
        </Card>
      </View>

      {shareError ? <Text style={styles.error}>{shareError}</Text> : null}
      <Button title="Partilhar como PDF" onPress={() => void onShare("pdf")} loading={sharing === "pdf"} disabled={sharing !== null} />
      <Button
        title="Partilhar como imagem"
        onPress={() => void onShare("image")}
        loading={sharing === "image"}
        disabled={sharing !== null}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  capture: { backgroundColor: colors.surface, padding: spacing.sm },
  brand: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.heavy,
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  title: {
    fontSize: fontSizes.title,
    lineHeight: lineHeights.title,
    fontWeight: fontWeights.heavy,
    color: colors.brandText,
    marginTop: spacing.sm,
  },
  amount: { fontSize: fontSizes.headline, fontWeight: fontWeights.heavy, color: colors.textPrimary },
  line: { gap: 2, marginTop: spacing.sm },
  label: { fontSize: fontSizes.small, color: colors.textSecondary, fontWeight: fontWeights.semibold },
  value: { fontSize: fontSizes.body, color: colors.textPrimary, fontWeight: fontWeights.bold },
  note: { fontSize: fontSizes.small, color: colors.textSecondary, marginTop: spacing.md },
  error: { color: colors.error, fontSize: fontSizes.body },
});
