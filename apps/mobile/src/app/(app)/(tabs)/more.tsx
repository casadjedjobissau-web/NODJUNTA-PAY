import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "../../../components/Button";
import { Screen } from "../../../components/Screen";
import { TextField } from "../../../components/TextField";
import { api } from "../../../lib/api";
import { userMessage } from "../../../lib/errors";
import { formatPhone } from "../../../lib/phone";
import { useAuth } from "../../../lib/session";
import type { ProfileView } from "../../../lib/types";
import { colors, fontSize, radius, spacing } from "../../../theme";

export default function MoreScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const view = await api.request<ProfileView>("/v1/profile");
      setProfile(view);
      setName(view.fullName ?? "");
    } catch (err) {
      setError(userMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // O Supabase pode devolver o telefone sem o "+".
  const rawPhone = session?.user.phone ?? "";
  const phone = rawPhone.length === 0 ? "" : rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;

  async function onSaveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError("Escreva o seu nome (mínimo 2 caracteres).");
      return;
    }
    setNameError(null);
    setSaved(false);
    setSaving(true);
    try {
      const view = await api.request<ProfileView>("/v1/profile", {
        method: "PATCH",
        body: { fullName: trimmed },
      });
      setProfile(view);
      setName(view.fullName ?? trimmed);
      setSaved(true);
    } catch (err) {
      setNameError(userMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.label}>Telemóvel</Text>
        <Text style={styles.value}>{phone ? formatPhone(phone) : "—"}</Text>
        <Text style={styles.label}>Nível de verificação</Text>
        <Text style={styles.value}>{profile ? `Nível ${profile.kycLevel}` : "—"}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Dinheiro</Text>
      <Button title="Depositar" onPress={() => router.push("/deposit")} />
      <Button title="Levantar" onPress={() => router.push("/withdraw")} />
      <Button title="Depósitos e levantamentos" onPress={() => router.push("/funding")} variant="secondary" />

      <Text style={styles.sectionTitle}>Conta</Text>
      <Button title="Limites e tarifas" onPress={() => router.push("/limits")} variant="secondary" />
      <Button title="Verificação de identidade" onPress={() => router.push("/kyc")} variant="secondary" />

      <TextField
        label="O seu nome"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setNameError(null);
          setSaved(false);
        }}
        placeholder="Nome completo"
        autoCapitalize="words"
        maxLength={120}
        error={nameError}
      />
      {saved ? <Text style={styles.ok}>Nome guardado.</Text> : null}
      <Button title="Guardar nome" onPress={onSaveName} loading={saving} variant="secondary" />

      <View style={styles.spacer} />
      <Button title="Terminar sessão" onPress={() => void signOut()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: "600", marginTop: spacing.sm },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: "700" },
  sectionTitle: { fontSize: fontSize.body, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.body },
  ok: { color: colors.success, fontSize: fontSize.small },
  spacer: { flex: 1, minHeight: spacing.lg },
});
