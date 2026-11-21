import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { usePinPrompt } from "../../components/PinPrompt";
import { ResultCard } from "../../components/ResultCard";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../../design/tokens";
import { api } from "../../lib/api";
import { createAttemptKeeper, isAmbiguousFailure } from "../../lib/attempt";
import { userMessage } from "../../lib/errors";
import { fundingStatusLabel } from "../../lib/funding";
import { newIdempotencyKey } from "../../lib/idempotency";
import { formatMoney, parseAmountInput } from "../../lib/money";
import { formatPhone, normalizeGwPhone } from "../../lib/phone";
import { pinErrorKind } from "../../lib/pin-errors";
import { usePinStatus } from "../../lib/pin-status";
import type { FundingResult } from "../../lib/types";
import { withPin } from "../../lib/with-pin";

type Step = "form" | "confirm";

export default function WithdrawScreen() {
  const router = useRouter();
  const requestPin = usePinPrompt();
  const { refresh: refreshPinStatus } = usePinStatus();
  const [keeper] = useState(() => createAttemptKeeper(newIdempotencyKey));
  const [step, setStep] = useState<Step>("form");
  const [phoneText, setPhoneText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FundingResult | null>(null);

  const phone = normalizeGwPhone(phoneText);
  const amount = parseAmountInput(amountText);

  function onContinue() {
    setPhoneError(phone === null ? "Número inválido. Introduza os 9 dígitos." : null);
    setAmountError(amount === null ? "Introduza um valor inteiro maior que zero." : null);
    if (phone === null || amount === null) {
      return;
    }
    setError(null);
    setRetryHint(false);
    setStep("confirm");
  }

  async function onConfirm() {
    if (phone === null || amount === null) {
      return;
    }
    const key = keeper.acquire(`withdraw|${phone}|${amount}`);

    setError(null);
    setRetryHint(false);
    try {
      const outcome = await withPin(
        () =>
          requestPin({
            title: "Confirme com o PIN",
            message: `Levantar ${formatMoney(amount)} para ${formatPhone(phone)}.`,
          }),
        async (pin) => {
          setLoading(true);
          return api.request<FundingResult>("/v1/withdrawals", {
            method: "POST",
            body: { amount, destination: phone },
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
    } catch (err) {
      keeper.settle(err);
      setError(userMessage(err));
      setRetryHint(isAmbiguousFailure(err));
      if (pinErrorKind(err) === "not_set") {
        void refreshPinStatus();
      }
    } finally {
      setLoading(false);
    }
  }

  function onRetry() {
    keeper.reset();
    setResult(null);
    setStep("form");
  }

  if (result && result.request.status === "failed") {
    return (
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          Levantamento não realizado
        </Text>
        <Text style={styles.text}>O pedido falhou e o valor foi devolvido ao seu saldo. Pode tentar de novo.</Text>
        <Button title="Tentar novamente" onPress={onRetry} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen>
        <ResultCard
          title="Pedido de levantamento registado"
          lines={[
            { label: "Valor", value: formatMoney(result.request.amount, result.request.currency) },
            {
              label: "Destino",
              value: result.request.destination ? formatPhone(result.request.destination) : "—",
            },
            { label: "Estado", value: fundingStatusLabel(result.request.status) },
            { label: "Referência", value: result.request.id.slice(0, 8).toUpperCase() },
          ]}
          note={
            result.replayed
              ? "Este pedido já tinha sido registado. Não foi criado outro."
              : "O valor ficou retido até o levantamento ser concluído. Se falhar, é devolvido."
          }
          buttonLabel="Ver os meus pedidos"
          onDone={() => router.replace("/funding")}
        />
      </Screen>
    );
  }

  if (step === "confirm" && phone !== null && amount !== null) {
    return (
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          Confirme os dados
        </Text>
        <Card>
          <Text style={styles.label}>Destino</Text>
          <Text style={styles.value}>{formatPhone(phone)}</Text>
          <Text style={styles.label}>Valor</Text>
          <Text style={styles.value}>{formatMoney(amount)}</Text>
        </Card>
        <Text style={styles.hint}>
          O valor (e a tarifa, se existir) fica retido até o levantamento ser concluído. Se falhar, é devolvido. Veja
          as tarifas em Limites e tarifas. Vai pedir o seu PIN para concluir.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {retryHint ? (
          <Text style={styles.hint}>
            Se a ligação falhou, toque em Confirmar outra vez e volte a escrever o PIN: não será criado um pedido
            duplicado.
          </Text>
        ) : null}
        <Button title="Confirmar levantamento" onPress={() => void onConfirm()} loading={loading} />
        <Button title="Voltar" onPress={() => setStep("form")} variant="secondary" disabled={loading} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.text}>Para levantar dinheiro, indique o número de telemóvel de destino e o valor.</Text>
      <TextField
        label="Número de destino"
        prefix="+245"
        value={phoneText}
        onChangeText={(value) => {
          setPhoneText(value);
          setPhoneError(null);
        }}
        placeholder="9XX XXX XXX"
        keyboardType="phone-pad"
        maxLength={20}
        error={phoneError}
      />
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
      />
      <Button title="Continuar" onPress={onContinue} />
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
  text: { fontSize: fontSizes.body, lineHeight: lineHeights.body, color: colors.textSecondary },
  label: {
    fontSize: fontSizes.small,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.sm,
  },
  value: { fontSize: fontSizes.body, color: colors.textPrimary, fontWeight: fontWeights.bold },
  error: { color: colors.error, fontSize: fontSizes.body },
  hint: { color: colors.textSecondary, fontSize: fontSizes.small },
});
