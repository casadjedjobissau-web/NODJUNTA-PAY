import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "../../../components/Button";
import { MovementRow } from "../../../components/MovementRow";
import { Screen } from "../../../components/Screen";
import { api } from "../../../lib/api";
import { userMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import type { StatementEntry, StatementPage, WalletView } from "../../../lib/types";
import { colors, fontSize, radius, spacing } from "../../../theme";

export default function HomeScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [recent, setRecent] = useState<StatementEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [walletView, page] = await Promise.all([
        api.request<WalletView>("/v1/wallet"),
        api.request<StatementPage>("/v1/wallet/statement?limit=5"),
      ]);
      setWallet(walletView);
      setRecent(page.items);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualiza sempre que o ecrã volta a ficar visível (por exemplo, depois de enviar dinheiro).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Saldo disponível</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Mostrar saldo" : "Ocultar saldo"}
            onPress={() => setHidden((value) => !value)}
          >
            <Text style={styles.toggle}>{hidden ? "Mostrar" : "Ocultar"}</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : wallet ? (
          <Text style={styles.balance}>{hidden ? "••••••" : formatMoney(wallet.balance, wallet.currency)}</Text>
        ) : (
          <Text style={styles.balance}>—</Text>
        )}
      </View>

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title="Enviar" onPress={() => router.push("/send")} />
        </View>
        <View style={styles.action}>
          <Button title="Pagar" onPress={() => router.push("/pay")} />
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Tentar novamente" onPress={onRefresh} variant="secondary" />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Últimos movimentos</Text>
      {recent.length === 0 && !loading && !error ? (
        <Text style={styles.empty}>Ainda não tem movimentos.</Text>
      ) : null}
      {recent.map((entry) => (
        <MovementRow key={entry.id} entry={entry} currency={wallet?.currency} />
      ))}
      {recent.length > 0 ? (
        <Button title="Ver extrato completo" onPress={() => router.push("/statement")} variant="secondary" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: colors.surface, opacity: 0.85, fontSize: fontSize.small, fontWeight: "600" },
  toggle: { color: colors.accent, fontSize: fontSize.small, fontWeight: "700" },
  balance: { color: colors.surface, fontSize: fontSize.display, fontWeight: "800" },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { flex: 1 },
  errorBox: { gap: spacing.sm },
  errorText: { color: colors.danger, fontSize: fontSize.body },
  sectionTitle: { fontSize: fontSize.body, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  empty: { color: colors.textMuted, fontSize: fontSize.body },
});
