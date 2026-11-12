import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../../components/Button";
import { ResultCard } from "../../../components/ResultCard";
import { Screen } from "../../../components/Screen";
import { TextField } from "../../../components/TextField";
import { api } from "../../../lib/api";
import { createAttemptKeeper, isAmbiguousFailure } from "../../../lib/attempt";
import { userMessage } from "../../../lib/errors";
import { newIdempotencyKey } from "../../../lib/idempotency";
import { formatMoney, parseAmountInput } from "../../../lib/money";
import { formatPhone, normalizeGwPhone } from "../../../lib/phone";
import type { TransferResult } from "../../../lib/types";
import { colors, fontSize, radius, spacing } from "../../../theme";

type Step = "form" | "confirm" | "done";

export default function SendScreen() {
  const [keeper] = useState(() => createAttemptKeeper(newIdempotencyKey));
  const [step, setStep] = useState<Step>("form");
  const [phoneText, setPhoneText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [reference, setReference] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);

  const phone = normalizeGwPhone(phoneText);
  const amount = parseAmountInput(amountText);

  function onContinue() {
    const invalidPhone = phone === null;
    const invalidAmount = amount === null;
    setPhoneError(invalidPhone ? "Número inválido. Introduza os 9 dígitos." : null);
    setAmountError(invalidAmount ? "Introduza um valor inteiro maior que zero." : null);
    if (invalidPhone || invalidAmount) {
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
    const note = reference.trim();
    const key = keeper.acquire(`${phone}|${amount}|${note}`);
    const body: { toPhone: string; amount: number; reference?: string } = { toPhone: phone, amount };
    if (note.length > 0) {
      body.reference = note;
    }

    setLoading(true);
    setError(null);
    setRetryHint(false);
    try {
      const response = await api.request<TransferResult>("/v1/transfers", {
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
      setLoading(false);
    }
  }

  function onNew() {
    keeper.reset();
    setStep("form");
    setPhoneText("");
    setAmountText("");
    setReference("");
    setError(null);
    setRetryHint(false);
    setResult(null);
  }

  if (step === "done" && result) {
    return (
      <Screen>
        <ResultCard
          title="Transferência concluída"
          lines={[
            { label: "Destinatário", value: formatPhone(result.toPhone) },
            { label: "Valor", value: formatMoney(result.amount, result.currency) },
            { label: "Referência da operação", value: result.transactionId.slice(0, 8).toUpperCase() },
          ]}
          note={result.replayed ? "Esta operação já tinha sido registada. Não foi cobrada outra vez." : undefined}
          buttonLabel="Nova transferência"
          onDone={onNew}
        />
      </Screen>
    );
  }

  if (step === "confirm" && phone !== null && amount !== null) {
    return (
      <Screen>
        <Text style={styles.title}>Confirme os dados</Text>
        <View style={styles.summary}>
          <Text style={styles.label}>Para</Text>
          <Text style={styles.value}>{formatPhone(phone)}</Text>
          <Text style={styles.label}>Valor</Text>
          <Text style={styles.value}>{formatMoney(amount)}</Text>
          {reference.trim().length > 0 ? (
            <>
              <Text style={styles.label}>Referência</Text>
              <Text style={styles.value}>{reference.trim()}</Text>
            </>
          ) : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {retryHint ? (
          <Text style={styles.hint}>
            Se a ligação falhou, toque em Confirmar outra vez: a operação não será cobrada duas vezes.
          </Text>
        ) : null}
        <Button title="Confirmar envio" onPress={onConfirm} loading={loading} />
        <Button title="Voltar" onPress={() => setStep("form")} variant="secondary" disabled={loading} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TextField
        label="Número do destinatário"
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
      <TextField
        label="Referência (opcional)"
        value={reference}
        onChangeText={setReference}
        placeholder="Ex.: almoço"
        maxLength={140}
      />
      <Button title="Continuar" onPress={onContinue} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: "700", color: colors.text },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: "600", marginTop: spacing.sm },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: "700" },
  error: { color: colors.danger, fontSize: fontSize.body },
  hint: { color: colors.textMuted, fontSize: fontSize.small },
});
