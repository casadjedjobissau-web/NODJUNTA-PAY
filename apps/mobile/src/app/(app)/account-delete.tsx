import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { usePinPrompt } from "../../components/PinPrompt";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../../design/tokens";
import {
  CONFIRM_WORD,
  blockerAction,
  classifyDeletionError,
  isConfirmed,
  type DeletionCheck,
} from "../../lib/account-deletion";
import { api } from "../../lib/api";
import type { RequestOptions } from "../../lib/api-client";
import { userMessage } from "../../lib/errors";
import { usePinStatus } from "../../lib/pin-status";
import { useAuth } from "../../lib/session";
import { withPin } from "../../lib/with-pin";

type Step = "form" | "needs_login";

const CONSEQUENCES: readonly string[] = [
  "O seu nome, número de telemóvel e dispositivos são removidos, e deixa de poder entrar com esta conta.",
  "O PIN e as notificações são apagados e a carteira é fechada.",
  "O número de telemóvel fica livre para criar uma conta nova.",
  "Os registos das operações já feitas, e os recibos de outras pessoas, são conservados por obrigação de conservação de registos financeiros.",
  "Se enviou documentos de verificação de identidade, são conservados durante o prazo exigido por lei.",
  "Esta ação não pode ser desfeita.",
];

export default function AccountDeleteScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const requestPin = usePinPrompt();
  const { hasPin } = usePinStatus();

  const [check, setCheck] = useState<DeletionCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>("form");

  const load = useCallback(async () => {
    try {
      setError(null);
      setCheck(await api.request<DeletionCheck>("/v1/account/deletion-check"));
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function callDelete(pin?: string) {
    const options: RequestOptions = { method: "POST", body: { confirm: CONFIRM_WORD } };
    if (pin) {
      options.pin = pin;
    }
    return api.request<{ status: string }>("/v1/account/delete", options);
  }

  async function onDelete() {
    if (!isConfirmed(confirmText)) {
      setError(`Escreva ${CONFIRM_WORD} para confirmar.`);
      return;
    }
    setError(null);
    try {
      if (hasPin) {
        const outcome = await withPin(
          () =>
            requestPin({
              title: "Confirme com o PIN",
              message: "Vai eliminar a sua conta de forma definitiva.",
            }),
          async (pin) => {
            setBusy(true);
            return callDelete(pin);
          },
        );
        if (outcome.cancelled) {
          return;
        }
      } else {
        setBusy(true);
        await callDelete();
      }
      await signOut();
    } catch (err) {
      const kind = classifyDeletionError(err);
      if (kind === "needs_login") {
        setStep("needs_login");
      } else {
        setError(userMessage(err));
        if (kind === "blocked") {
          void load();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brandText} />
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
          Por segurança, para eliminar a conta precisa de ter entrado com o código SMS há menos de 10 minutos.
        </Text>
        <Text style={styles.text}>
          Termine a sessão, volte a entrar com o seu número e o código SMS, e depois abra outra vez "Eliminar conta"
          dentro de 10 minutos.
        </Text>
        <Button title="Terminar sessão" onPress={() => void signOut()} />
        <Button title="Voltar" onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  if (!check) {
    return (
      <Screen>
        <Text style={styles.error}>{error ?? "Não foi possível verificar a conta."}</Text>
        <Button title="Tentar novamente" onPress={() => void load()} />
      </Screen>
    );
  }

  if (check.alreadyDeleted) {
    return (
      <Screen>
        <Text style={styles.text}>Esta conta já foi eliminada.</Text>
        <Button title="Terminar sessão" onPress={() => void signOut()} />
      </Screen>
    );
  }

  if (check.blockers.length > 0) {
    return (
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          Ainda não é possível eliminar
        </Text>
        {check.blockers.map((blocker) => {
          const action = blockerAction(blocker.code);
          return (
            <Card key={blocker.code}>
              <Text style={styles.text}>{blocker.message}</Text>
              {action ? (
                <Button title={action.label} onPress={() => router.push(action.href)} variant="secondary" />
              ) : null}
            </Card>
          );
        })}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Verificar outra vez" onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        Eliminar a conta
      </Text>
      <Card>
        <Text style={styles.subtitle}>O que acontece</Text>
        {CONSEQUENCES.map((line) => (
          <Text key={line} style={styles.text}>
            {`• ${line}`}
          </Text>
        ))}
      </Card>

      <TextField
        label={`Escreva ${CONFIRM_WORD} para confirmar`}
        value={confirmText}
        onChangeText={(value) => {
          setConfirmText(value);
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={CONFIRM_WORD}
        error={error}
      />

      <Button title="Manter a minha conta" onPress={() => router.back()} disabled={busy} />
      <Button
        title="Eliminar a conta"
        onPress={() => void onDelete()}
        loading={busy}
        disabled={!isConfirmed(confirmText)}
        variant="secondary"
      />
    </Screen>
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
  subtitle: { fontSize: fontSizes.body, fontWeight: fontWeights.bold, color: colors.textPrimary },
  text: { fontSize: fontSizes.body, lineHeight: lineHeights.body, color: colors.textSecondary },
  error: { color: colors.error, fontSize: fontSizes.body },
});
