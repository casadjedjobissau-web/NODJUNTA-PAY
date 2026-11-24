import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { BrandHeader } from "../../components/BrandHeader";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { SupportContacts } from "../../components/SupportContacts";
import { TextField } from "../../components/TextField";
import { radius } from "../../design/tokens";
import { userMessage } from "../../lib/errors";
import { normalizeGwPhone } from "../../lib/phone";
import { useAuth } from "../../lib/session";

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
      <View style={styles.header}>
        <BrandHeader
          title="NODJUNTA-PAY"
          subtitle="Introduza o seu número de telemóvel. Vamos enviar-lhe um código por SMS."
        />
      </View>
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
      <Button title="Continuar" onPress={() => void onContinue()} loading={loading} disabled={text.trim().length === 0} />
      <SupportContacts intro="Perdeu o número ou o cartão SIM? Ligue para o suporte, que pode ajudar a recuperar o acesso à conta." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { borderRadius: radius.lg, overflow: "hidden" },
});
