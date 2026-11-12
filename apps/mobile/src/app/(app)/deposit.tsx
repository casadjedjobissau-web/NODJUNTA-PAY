import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { ResultCard } from "../../components/ResultCard";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { api } from "../../lib/api";
import { createAttemptKeeper, isAmbiguousFailure } from "../../lib/attempt";
import { userMessage } from "../../lib/errors";
import { fundingStatusLabel } from "../../lib/funding";
import { newIdempotencyKey } from "../../lib/idempotency";
import { formatMoney, parseAmountInput } from "../../lib/money";
import type { FundingResult } from "../../lib/types";
import { colors, fontSize } from "../../theme";

export default function DepositScreen() {
  const router = useRouter();
  const [keeper] = useState(() => createAttemptKeeper(newIdempotencyKey));
  const [amountText, setAmountText] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FundingResult | null>(null);

  async function onSubmit() {
    const amount = parseAmountInput(amountText);
    if (amount === null) {
      setAmountError("Introduza um valor inteiro maior que zero.");
      return;
    }
    setAmountError(null);
    setError(null);
    setRetryHint(false);
    setLoading(true);
    try {
      const response = await api.request<FundingResult>("/v1/deposits", {
        method: "POST",
        body: { amount },
        idempotencyKey: keeper.acquire(`deposit|${amount}`),
      });
      keeper.reset();
      setResult(response);
    } catch (err) {
      keeper.settle(err);
      setError(userMessage(err));
      setRetryHint(isAmbiguousFailure(err));
    } finally {
      setLoading(false);
    }
  }

  function onRetry() {
    keeper.reset();
    setResult(null);
  }

  if (result && result.request.status === "failed") {
    return (
      <Screen>
        <Text style={styles.title}>Depósito não realizado</Text>
        <Text style={styles.text}>O pedido falhou. Nenhum valor foi creditado. Pode tentar de novo.</Text>
        <Button title="Tentar novamente" onPress={onRetry} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen>
        <ResultCard
          title="Pedido de depósito registado"
          lines={[
            { label: "Valor", value: formatMoney(result.request.amount, result.request.currency) },
            { label: "Estado", value: fundingStatusLabel(result.request.status) },
            { label: "Referência", value: result.request.id.slice(0, 8).toUpperCase() },
          ]}
          note={
            result.replayed
              ? "Este pedido já tinha sido registado. Não foi criado outro."
              : "O saldo só aumenta quando o depósito for confirmado."
          }
          buttonLabel="Ver os meus pedidos"
          onDone={() => router.replace("/funding")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.text}>
        Indique o valor que quer depositar. O saldo só é atualizado quando o pagamento for confirmado.
      </Text>
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {retryHint ? (
        <Text style={styles.hint}>
          Se a ligação falhou, toque em Pedir depósito outra vez: não será criado um pedido duplicado.
        </Text>
      ) : null}
      <Button title="Pedir depósito" onPress={onSubmit} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: "700", color: colors.text },
  text: { fontSize: fontSize.body, color: colors.textMuted },
  error: { color: colors.danger, fontSize: fontSize.body },
  hint: { color: colors.textMuted, fontSize: fontSize.small },
});
