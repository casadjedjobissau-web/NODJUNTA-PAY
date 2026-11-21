import { useState } from "react";
import { useRouter } from "expo-router";
import { PinStep } from "../../components/PinStep";
import { ResultCard } from "../../components/ResultCard";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { userMessage } from "../../lib/errors";
import { pinProblem } from "../../lib/pin";
import { isComplete } from "../../lib/pin-entry";

type Step = "current" | "new" | "confirm" | "done";

const TITLES: Record<Exclude<Step, "done">, string> = {
  current: "PIN atual",
  new: "PIN novo",
  confirm: "Confirme o PIN novo",
};

const SUBTITLES: Record<Exclude<Step, "done">, string> = {
  current: "Escreva o PIN que usa agora.",
  new: "Escolha um PIN novo de 6 dígitos, diferente do atual.",
  confirm: "Escreva o PIN novo outra vez.",
};

export default function PinChangeScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("current");
  const [current, setCurrent] = useState("");
  const [fresh, setFresh] = useState("");
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onComplete(pin: string) {
    if (step === "current") {
      setCurrent(pin);
      setDigits("");
      setError(null);
      setStep("new");
      return;
    }

    if (step === "new") {
      const problem = pinProblem(pin);
      if (problem) {
        setError(problem);
        setDigits("");
        return;
      }
      if (pin === current) {
        setError("O PIN novo tem de ser diferente do atual.");
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
        setError("Os dois PIN novos não coincidem.");
        setDigits("");
        setFresh("");
        setStep("new");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        await api.request("/v1/pin/change", { method: "POST", body: { currentPin: current, newPin: pin } });
        setCurrent("");
        setFresh("");
        setDigits("");
        setStep("done");
      } catch (err) {
        setError(userMessage(err));
        setDigits("");
        setFresh("");
        const code = err instanceof ApiError ? err.code : "";
        if (code === "weak_pin" || code === "same_pin") {
          setStep("new");
        } else {
          setCurrent("");
          setStep("current");
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
          title="PIN alterado"
          lines={[]}
          note="Por segurança, os levantamentos ficam em pausa durante algumas horas depois de alterar o PIN. As transferências e os pagamentos continuam disponíveis."
          buttonLabel="Concluir"
          onDone={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <PinStep
      title={TITLES[step]}
      subtitle={SUBTITLES[step]}
      value={digits}
      onChange={onChange}
      error={error}
      busy={busy}
    />
  );
}
