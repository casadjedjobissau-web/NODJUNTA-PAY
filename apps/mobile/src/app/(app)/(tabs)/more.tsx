import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Icon } from "../../../components/Icon";
import { ListRow } from "../../../components/ListRow";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { TextField } from "../../../components/TextField";
import type { IconName } from "../../../design/icons";
import { colors, fontSizes, fontWeights, spacing } from "../../../design/tokens";
import { api } from "../../../lib/api";
import { userMessage } from "../../../lib/errors";
import { formatPhone } from "../../../lib/phone";
import { useAuth } from "../../../lib/session";
import type { ProfileView } from "../../../lib/types";

interface NavItem {
  title: string;
  subtitle?: string;
  icon: IconName;
  href: string;
}

const MONEY: readonly NavItem[] = [
  { title: "Depositar", subtitle: "Pedir um depósito na carteira", icon: "plus", href: "/deposit" },
  { title: "Levantar", subtitle: "Levantar dinheiro da carteira", icon: "minus", href: "/withdraw" },
  { title: "Depósitos e levantamentos", icon: "history", href: "/funding" },
];

const ACCOUNT: readonly NavItem[] = [
  { title: "Limites e tarifas", icon: "settings", href: "/limits" },
  { title: "Verificação de identidade", icon: "shield", href: "/kyc" },
  { title: "Sou comerciante", icon: "store", href: "/merchant" },
];

const SECURITY: readonly NavItem[] = [
  { title: "Alterar PIN", subtitle: "Precisa do PIN atual", icon: "lock", href: "/pin-change" },
  { title: "Recuperar PIN", subtitle: "Se se esqueceu do PIN", icon: "lock", href: "/pin-reset" },
];

function NavCard({ items, onOpen }: { items: readonly NavItem[]; onOpen: (href: string) => void }) {
  return (
    <Card padded={false} style={styles.navCard}>
      {items.map((item, index) => (
        <ListRow
          key={item.href}
          title={item.title}
          subtitle={item.subtitle}
          left={<Icon name={item.icon} color={colors.brandText} />}
          right={<Icon name="chevronRight" size={20} color={colors.textSecondary} />}
          onPress={() => onOpen(item.href)}
          last={index === items.length - 1}
        />
      ))}
    </Card>
  );
}

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
      <Card>
        <Text style={styles.label}>Telemóvel</Text>
        <Text style={styles.value}>{phone ? formatPhone(phone) : "—"}</Text>
        <Text style={styles.label}>Nível de verificação</Text>
        <Text style={styles.value}>{profile ? `Nível ${profile.kycLevel}` : "—"}</Text>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionHeader title="Dinheiro" />
      <NavCard items={MONEY} onOpen={(href) => router.push(href)} />

      <SectionHeader title="Conta" />
      <NavCard items={ACCOUNT} onOpen={(href) => router.push(href)} />

      <SectionHeader title="Segurança" />
      <NavCard items={SECURITY} onOpen={(href) => router.push(href)} />

      <SectionHeader title="O seu nome" />
      <TextField
        label="Nome completo"
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
      <Button title="Guardar nome" onPress={() => void onSaveName()} loading={saving} variant="secondary" />

      <View style={styles.spacer} />
      <Button title="Terminar sessão" onPress={() => void signOut()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  navCard: { paddingHorizontal: spacing.md },
  label: {
    fontSize: fontSizes.small,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.sm,
  },
  value: { fontSize: fontSizes.body, color: colors.textPrimary, fontWeight: fontWeights.bold },
  error: { color: colors.error, fontSize: fontSizes.body },
  ok: { color: colors.brandText, fontSize: fontSizes.small },
  spacer: { flex: 1, minHeight: spacing.lg },
});
