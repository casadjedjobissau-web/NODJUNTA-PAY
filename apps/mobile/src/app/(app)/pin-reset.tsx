import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { PinStep } from "../../components/PinStep";
import { ResultCard } from "../../components/ResultCard";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { userMessage } from "../../lib/errors";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../../design/tokens";
import { pinProblem } from "../../lib/pin";
import { isComplete } from "../../lib/pin-entry";
import { useAuth } from "../../lib/session";

type Step = "new" | "confirm" | "needs_login" | "done";

export default function PinResetScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [step, setStep] = useState<Step>("new");
  const [fresh, setFresh] = useState("");
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onComplete(pin: string) {
    if (step === "new") {
      const problem = pinProblem(pin);
      if (problem) {
        setError(problem);
        setDigits("");
        return;
      }
      setFresh(pin);
      setDigits("");
      setError(null);
      setStep("confirm");
      return;
    }

    if (step === "confirm") {
      if (pin !== fresh) {
        setError("Os dois PIN não coincidem. Comece de novo.");
        setDigits("");
        setFresh("");
        setStep("new");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        await api.request("/v1/pin/reset", { method: "POST", body: { newPin: pin } });
        setFresh("");
        setDigits("");
        setStep("done");
      } catch (err) {
        setDigits("");
        setFresh("");
        if (err instanceof ApiError && err.code === "recent_login_required") {
          setStep("needs_login");
        } else {
          setError(userMessage(err));
          setStep("new");
        }
      } finally {
        setBusy(false);
      }
    }
  }

  function onChange(next: string) {
    setDigits(next);
    if (isComplete(next)) {
      void onComplete(next);
    }
  }

  if (step === "done") {
    return (
      <Screen>
        <ResultCard
          title="PIN redefinido"
          lines={[]}
          note="Por segurança, os levantamentos ficam em pausa durante algumas horas depois de alterar o PIN. As transferências e os pagamentos continuam disponíveis."
          buttonLabel="Concluir"
          onDone={() => router.back()}
        />
      </Screen>
    );
  }

  if (step === "needs_login") {
    return (
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          Confirme que é você
        </Text>
        <Text style={styles.text}>
          Por segurança, para recuperar o PIN precisa de ter entrado com o código SMS há menos de 10 minutos.
        </Text>
        <Text style={styles.text}>
          Termine a sessão, volte a entrar com o seu número e o código SMS, e depois abra outra vez
          "Recuperar PIN" dentro de 10 minutos.
        </Text>
        <Button title="Terminar sessão" onPress={() => void signOut()} />
        <Button title="Voltar" onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <PinStep
      title={step === "new" ? "Escolha um PIN novo" : "Confirme o PIN novo"}
      subtitle={
        step === "new"
          ? "Esqueceu o PIN? Escolha um novo de 6 dígitos. Nunca o diga a ninguém: nem o suporte lhe vai pedir o PIN."
          : "Escreva o PIN novo outra vez."
      }
      value={digits}
      onChange={onChange}
      error={error}
      busy={busy}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.headline,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.heavy,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  text: { fontSize: fontSizes.body, lineHeight: lineHeights.body, color: colors.textSecondary },
});
