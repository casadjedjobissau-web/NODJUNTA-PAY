import { useState } from "react";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { PinStep } from "../../components/PinStep";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { userMessage } from "../../lib/errors";
import { pinProblem } from "../../lib/pin";
import { isComplete } from "../../lib/pin-entry";
import { usePinStatus } from "../../lib/pin-status";
import { useAuth } from "../../lib/session";

type Step = "create" | "confirm";

export default function PinSetupScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { refresh } = usePinStatus();
  const [step, setStep] = useState<Step>("create");
  const [first, setFirst] = useState("");
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onComplete(pin: string) {
    if (step === "create") {
      const problem = pinProblem(pin);
      if (problem) {
        setError(problem);
        setDigits("");
        return;
      }
      setFirst(pin);
      setDigits("");
      setError(null);
      setStep("confirm");
      return;
    }

    if (pin !== first) {
      setError("Os dois PIN não coincidem. Comece de novo.");
      setDigits("");
      setFirst("");
      setStep("create");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.request("/v1/pin", { method: "POST", body: { pin } });
      await refresh();
      router.replace("/home");
    } catch (err) {
      if (err instanceof ApiError && err.code === "pin_already_set") {
        await refresh();
        router.replace("/home");
        return;
      }
      setError(userMessage(err));
      setDigits("");
      setFirst("");
      setStep("create");
    } finally {
      setSaving(false);
    }
  }

  function onChange(next: string) {
    setDigits(next);
    if (isComplete(next)) {
      void onComplete(next);
    }
  }

  return (
    <PinStep
      title={step === "create" ? "Crie o seu PIN" : "Confirme o seu PIN"}
      subtitle={
        step === "create"
          ? "Crie um PIN de 6 dígitos. Vai usá-lo para confirmar cada transferência, pagamento e levantamento. Nunca o diga a ninguém: nem o suporte lhe vai pedir o PIN."
          : "Escreva o mesmo PIN outra vez para confirmar."
      }
      value={digits}
      onChange={onChange}
      error={error}
      busy={saving}
    >
      <Button title="Terminar sessão" onPress={() => void signOut()} variant="secondary" disabled={saving} />
    </PinStep>
  );
}
