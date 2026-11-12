import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "../../../components/Button";
import { ResultCard } from "../../../components/ResultCard";
import { Screen } from "../../../components/Screen";
import { TextField } from "../../../components/TextField";
import { api } from "../../../lib/api";
import { createAttemptKeeper, isAmbiguousFailure } from "../../../lib/attempt";
import { userMessage } from "../../../lib/errors";
import { newIdempotencyKey } from "../../../lib/idempotency";
import { formatMoney, parseAmountInput } from "../../../lib/money";
import { buildQrPayload, normalizeMerchantCode, parseQrPayload } from "../../../lib/qr";
import type { MerchantPaymentResult, MerchantPreview } from "../../../lib/types";
import { colors, fontSize, radius, spacing } from "../../../theme";

type Step = "scan" | "amount" | "done";

export default function PayScreen() {
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
      setScanError("Este QR Code não é da NÔDJUNTA PAY.");
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

    setPaying(true);
    setError(null);
    setRetryHint(false);
    try {
      const response = await api.request<MerchantPaymentResult>("/v1/payments/merchant", {
        method: "POST",
        body,
        idempotencyKey: key,
      });
      keeper.reset();
      setResult(response);
      setStep("done");
    } catch (err) {
      keeper.settle(err);
      setError(userMessage(err));
      setRetryHint(isAmbiguousFailure(err));
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
        />
      </Screen>
    );
  }

  if (step === "amount" && merchant) {
    return (
      <Screen>
        <View style={styles.merchantCard}>
          <Text style={styles.label}>Pagar a</Text>
          <Text style={styles.merchantName}>{merchant.businessName}</Text>
          <Text style={styles.code}>Código {merchant.merchantCode}</Text>
        </View>
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
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {retryHint ? (
          <Text style={styles.hint}>
            Se a ligação falhou, toque em Pagar outra vez: o pagamento não será cobrado duas vezes.
          </Text>
        ) : null}
        <Button title="Pagar" onPress={onPay} loading={paying} />
        <Button title="Cancelar" onPress={onNew} variant="secondary" disabled={paying} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Aponte a câmara ao QR Code do comerciante</Text>

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
  title: { fontSize: fontSize.title, fontWeight: "700", color: colors.text },
  camera: {
    height: 320,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.text,
  },
  permissionBox: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.body, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  merchantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: "600" },
  merchantName: { fontSize: fontSize.title, fontWeight: "800", color: colors.text },
  code: { fontSize: fontSize.small, color: colors.textMuted },
  error: { color: colors.danger, fontSize: fontSize.body },
  hint: { color: colors.textMuted, fontSize: fontSize.small },
});
