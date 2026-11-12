import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { userMessage } from "../../lib/errors";
import { OTP_LENGTH, RESEND_SECONDS, isCompleteOtp, sanitizeOtp } from "../../lib/otp";
import { formatPhone } from "../../lib/phone";
import { useAuth } from "../../lib/session";
import { colors, fontSize, spacing } from "../../theme";

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string | string[] }>();
  const rawPhone = Array.isArray(params.phone) ? params.phone[0] : params.phone;
  const phone = rawPhone && /^\+245[0-9]{9}$/.test(rawPhone) ? rawPhone : null;

  const { requestOtp, verifyOtp } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  if (!phone) {
    return <Redirect href="/phone" />;
  }

  async function onVerify() {
    if (!phone || !isCompleteOtp(code)) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Em caso de sucesso a sessão é criada e o layout redireciona para o ecrã inicial.
      await verifyOtp(phone, code);
    } catch (err) {
      setError(userMessage(err));
      setLoading(false);
    }
  }

  async function onResend() {
    if (!phone) {
      return;
    }
    setError(null);
    setResending(true);
    try {
      await requestOtp(phone);
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Introduza o código</Text>
      <Text style={styles.subtitle}>Enviámos um SMS para {formatPhone(phone)}.</Text>
      <TextField
        label="Código de verificação"
        value={code}
        onChangeText={(value) => {
          setCode(sanitizeOtp(value));
          setError(null);
        }}
        placeholder={"0".repeat(OTP_LENGTH)}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={OTP_LENGTH}
        autoFocus
        error={error}
      />
      <Button title="Entrar" onPress={onVerify} loading={loading} disabled={!isCompleteOtp(code)} />
      <Button
        title={secondsLeft > 0 ? `Reenviar código (${secondsLeft}s)` : "Reenviar código"}
        onPress={onResend}
        loading={resending}
        disabled={secondsLeft > 0 || loading}
        variant="secondary"
      />
      <Button title="Alterar número" onPress={() => router.back()} variant="secondary" disabled={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: "700", color: colors.text, marginTop: spacing.xl },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, marginBottom: spacing.md },
});
