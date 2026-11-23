import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { usePinPrompt } from "../../../components/PinPrompt";
import { ResultCard } from "../../../components/ResultCard";
import { Screen } from "../../../components/Screen";
import { TextField } from "../../../components/TextField";
import { colors, fontSizes, fontWeights, lineHeights, radius, spacing } from "../../../design/tokens";
import { api } from "../../../lib/api";
import { createAttemptKeeper, isAmbiguousFailure } from "../../../lib/attempt";
import { userMessage } from "../../../lib/errors";
import { newIdempotencyKey } from "../../../lib/idempotency";
import { formatMoney, parseAmountInput } from "../../../lib/money";
import { pinErrorKind } from "../../../lib/pin-errors";
import { usePinStatus } from "../../../lib/pin-status";
import { buildQrPayload, normalizeMerchantCode, parseQrPayload } from "../../../lib/qr";
import type { MerchantPaymentResult, MerchantPreview } from "../../../lib/types";
import { withPin } from "../../../lib/with-pin";

type Step = "scan" | "amount" | "done";

export default function PayScreen() {
  const router = useRouter();
  const requestPin = usePinPrompt();
  const { refresh: refreshPinStatus } = usePinStatus();
  const [permission, requestPermission] = useCameraPermissions();
  const [keeper] = useState(() => createAttemptKeeper(newIdempotencyKey));
  const scanLock = useRef(false);

  const [step, setStep] = useState<Step>("scan");
  const [merchant, setMerchant] = useState<MerchantPreview | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [amountText, setAmountText] = useState("");
  const [reference, setReference] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<MerchantPaymentResult | null>(null);

  async function resolveMerchant(code: string) {
    setResolving(true);
    setScanError(null);
    try {
      const preview = await api.request<MerchantPreview>("/v1/payments/qr/resolve", {
        method: "POST",
        body: { payload: buildQrPayload(code) },
      });
      setMerchant(preview);
      setAmountText("");
      setReference("");
      setError(null);
      setStep("amount");
    } catch (err) {
      setScanError(userMessage(err));
    } finally {
      setResolving(false);
      setTimeout(() => {
        scanLock.current = false;
      }, 1500);
    }
  }

  function onScanned(event: { data: string }) {
    if (scanLock.current) {
      return;
    }
    scanLock.current = true;
    const code = parseQrPayload(event.data);
    if (!code) {
      setScanError("Este QR Code não é da NODJUNTA-PAY.");
      setTimeout(() => {
        scanLock.current = false;
      }, 1500);
      return;
    }
    void resolveMerchant(code);
  }

  function onManualSearch() {
    const code = normalizeMerchantCode(manualCode);
    if (!code) {
      setScanError("Código inválido. Tem 8 caracteres (números e letras A a F).");
      return;
    }
    void resolveMerchant(code);
  }

  async function onPay() {
    const amount = parseAmountInput(amountText);
    if (amount === null) {
      setAmountError("Introduza um valor inteiro maior que zero.");
      return;
    }
    if (!merchant) {
      return;
    }
    setAmountError(null);

    const note = reference.trim();
    const key = keeper.acquire(`${merchant.merchantCode}|${amount}|${note}`);
    const body: { merchantCode: string; amount: number; reference?: string } = {
      merchantCode: merchant.merchantCode,
      amount,
    };
    if (note.length > 0) {
      body.reference = note;
    }

    setError(null);
    setRetryHint(false);
    try {
      const outcome = await withPin(
        () =>
          requestPin({
            title: "Confirme com o PIN",
            message: `Pagar ${formatMoney(amount)} a ${merchant.businessName}.`,
          }),
        async (pin) => {
          setPaying(true);
          return api.request<MerchantPaymentResult>("/v1/payments/merchant", {
            method: "POST",
            body,
            idempotencyKey: key,
            pin,
          });
        },
      );
      if (outcome.cancelled) {
        return;
      }
      keeper.reset();
      setResult(outcome.value);
      setStep("done");
    } catch (err) {
      keeper.settle(err);
      setError(userMessage(err));
      setRetryHint(isAmbiguousFailure(err));
      if (pinErrorKind(err) === "not_set") {
        void refreshPinStatus();
      }
    } finally {
      setPaying(false);
    }
  }

  function onNew() {
    keeper.reset();
    scanLock.current = false;
    setStep("scan");
    setMerchant(null);
    setManualCode("");
    setAmountText("");
    setReference("");
    setScanError(null);
    setAmountError(null);
    setError(null);
    setRetryHint(false);
    setResult(null);
  }

  if (step === "done" && result) {
    return (
      <Screen>
        <ResultCard
          title="Pagamento concluído"
          lines={[
            { label: "Comerciante", value: result.businessName },
            { label: "Valor", value: formatMoney(result.amount, result.currency) },
            { label: "Referência da operação", value: result.transactionId.slice(0, 8).toUpperCase() },
          ]}
          note={result.replayed ? "Este pagamento já tinha sido registado. Não foi cobrado outra vez." : undefined}
          buttonLabel="Novo pagamento"
          onDone={onNew}
          secondaryLabel="Ver recibo"
          onSecondary={() => router.push({ pathname: "/receipt", params: { transactionId: result.transactionId } })}
        />
      </Screen>
    );
  }

  if (step === "amount" && merchant) {
    return (
      <Screen>
        <Card>
          <Text style={styles.label}>Pagar a</Text>
          <Text style={styles.merchantName}>{merchant.businessName}</Text>
          <Text style={styles.code}>Código {merchant.merchantCode}</Text>
        </Card>
        <TextField
          label="Valor (XOF)"
          value={amountText}
          onChangeText={(value) => {
            setAmountText(value);
            setAmountError(null);
          }}
          placeholder="0"
          keyboardType="number-pad"
          maxLength={13}
          error={amountError}
          autoFocus
        />
        <TextField
          label="Referência (opcional)"
          value={reference}
          onChangeText={setReference}
          placeholder="Ex.: pão"
          maxLength={140}
        />
        <Text style={styles.hint}>Vai pedir o seu PIN para concluir.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {retryHint ? (
          <Text style={styles.hint}>
            Se a ligação falhou, toque em Pagar outra vez e volte a escrever o PIN: o pagamento não será cobrado
            duas vezes.
          </Text>
        ) : null}
        <Button title="Pagar" onPress={() => void onPay()} loading={paying} />
        <Button title="Cancelar" onPress={onNew} variant="secondary" disabled={paying} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        Aponte a câmara ao QR Code do comerciante
      </Text>

      {permission === null ? null : permission.granted ? (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={resolving ? undefined : onScanned}
          />
        </View>
      ) : (
        <View style={styles.permissionBox}>
          <Text style={styles.hint}>
            {permission.canAskAgain
              ? "Precisamos da câmara para ler o QR Code."
              : "A câmara está bloqueada. Ative-a nas definições do telemóvel, ou escreva o código abaixo."}
          </Text>
          {permission.canAskAgain ? (
            <Button title="Permitir câmara" onPress={() => void requestPermission()} />
          ) : null}
        </View>
      )}

      {scanError ? <Text style={styles.error}>{scanError}</Text> : null}

      <Text style={styles.sectionTitle}>Ou escreva o código do comerciante</Text>
      <TextField
        label="Código do comerciante"
        value={manualCode}
        onChangeText={(value) => {
          setManualCode(value);
          setScanError(null);
        }}
        placeholder="AB12CD34"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
      />
      <Button
        title="Procurar comerciante"
        onPress={onManualSearch}
        loading={resolving}
        disabled={manualCode.trim().length === 0}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.title,
    lineHeight: lineHeights.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  camera: {
    height: 320,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceInverse,
  },
  permissionBox: { gap: spacing.sm },
  sectionTitle: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  label: { fontSize: fontSizes.small, color: colors.textSecondary, fontWeight: fontWeights.semibold },
  merchantName: { fontSize: fontSizes.title, fontWeight: fontWeights.heavy, color: colors.textPrimary },
  code: { fontSize: fontSizes.small, color: colors.textSecondary },
  error: { color: colors.error, fontSize: fontSizes.body },
  hint: { color: colors.textSecondary, fontSize: fontSizes.small },
});
