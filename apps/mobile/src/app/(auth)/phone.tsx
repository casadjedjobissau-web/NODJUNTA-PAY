import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { userMessage } from "../../lib/errors";
import { normalizeGwPhone } from "../../lib/phone";
import { useAuth } from "../../lib/session";
import { colors, fontSize, spacing } from "../../theme";

export default function PhoneScreen() {
  const router = useRouter();
  const { requestOtp } = useAuth();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onContinue() {
    const phone = normalizeGwPhone(text);
    if (!phone) {
      setError("Número inválido. Introduza os 9 dígitos do seu telemóvel.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestOtp(phone);
      router.push({ pathname: "/verify", params: { phone } });
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>NÔDJUNTA PAY</Text>
      <Text style={styles.subtitle}>
        Introduza o seu número de telemóvel. Vamos enviar-lhe um código por SMS.
      </Text>
      <TextField
        label="Número de telemóvel"
        prefix="+245"
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(null);
        }}
        placeholder="9XX XXX XXX"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={20}
        error={error}
      />
      <Button title="Continuar" onPress={onContinue} loading={loading} disabled={text.trim().length === 0} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.display, fontWeight: "800", color: colors.primary, marginTop: spacing.xl },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, marginBottom: spacing.md },
});
