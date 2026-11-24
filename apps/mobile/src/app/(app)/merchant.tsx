import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { colors, fontSizes, fontWeights, spacing } from "../../design/tokens";
import { ApiError } from "../../lib/api-client";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import {
  isValidBusinessName,
  merchantStatusHint,
  merchantStatusLabel,
  type MerchantQr,
  type MerchantView,
} from "../../lib/merchant";

export default function MerchantScreen() {
  const [merchant, setMerchant] = useState<MerchantView | null>(null);
  const [qr, setQr] = useState<MerchantQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const view = await api.request<MerchantView>("/v1/merchants/me");
      setMerchant(view);
      if (view.status === "active") {
        setQr(await api.request<MerchantQr>("/v1/merchants/me/qr"));
      } else {
        setQr(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "merchant_not_found") {
        setMerchant(null);
        setQr(null);
      } else {
        setError(userMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRegister() {
    if (!isValidBusinessName(name)) {
      setNameError("Escreva o nome do negócio (entre 2 e 120 caracteres).");
      return;
    }
    setNameError(null);
    setError(null);
    setSaving(true);
    try {
      await api.request<MerchantView>("/v1/merchants", {
        method: "POST",
        body: { businessName: name.trim() },
      });
      await load();
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brandText} />
      </Screen>
    );
  }

  if (!merchant) {
    return (
      <Screen>
        <Text style={styles.text}>
          Registe o seu negócio para receber pagamentos por QR Code. O registo fica em análise até ser aprovado.
        </Text>
        <TextField
          label="Nome do negócio"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError(null);
          }}
          placeholder="Ex.: Loja da Maria"
          autoCapitalize="words"
          maxLength={120}
          error={nameError}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Registar negócio" onPress={() => void onRegister()} loading={saving} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.label}>Negócio</Text>
        <Text style={styles.value}>{merchant.businessName}</Text>
        <Text style={styles.label}>Estado</Text>
        <Text style={styles.value}>{merchantStatusLabel(merchant.status)}</Text>
        <Text style={styles.label}>Código do comerciante</Text>
        <Text style={styles.value}>{merchant.merchantCode}</Text>
      </Card>

      <Text style={styles.text}>{merchantStatusHint(merchant.status)}</Text>

      {qr ? (
        <Card style={styles.qrCard}>
          <QRCode value={qr.payload} size={220} />
          <Text style={styles.qrHint}>Mostre este QR Code ao cliente.</Text>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Atualizar" onPress={() => void load()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: fontSizes.body, color: colors.textSecondary },
  error: { color: colors.error, fontSize: fontSizes.body },
  label: { fontSize: fontSizes.small, color: colors.textSecondary, fontWeight: fontWeights.semibold, marginTop: spacing.sm },
  value: { fontSize: fontSizes.body, color: colors.textPrimary, fontWeight: fontWeights.bold },
  qrCard: { alignItems: "center" },
  qrHint: { fontSize: fontSizes.small, color: colors.textSecondary },
});
