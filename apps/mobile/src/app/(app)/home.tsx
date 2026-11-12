import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import { formatMoney } from "../../lib/money";
import { useAuth } from "../../lib/session";
import type { WalletView } from "../../lib/types";
import { colors, fontSize, radius, spacing } from "../../theme";

export default function HomeScreen() {
  const { signOut } = useAuth();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setWallet(await api.request<WalletView>("/v1/wallet"));
    } catch (err) {
      setError(userMessage(err));
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Stack.Screen options={{ title: "NÔDJUNTA PAY" }} />

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

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Tentar novamente" onPress={onRefresh} variant="secondary" />
        </View>
      ) : null}

      <Text style={styles.hint}>Puxe o ecrã para baixo para atualizar o saldo.</Text>

      <View style={styles.spacer} />
      <Button title="Terminar sessão" onPress={() => void signOut()} variant="secondary" />
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
  errorBox: { gap: spacing.sm },
  errorText: { color: colors.danger, fontSize: fontSize.body },
  hint: { color: colors.textMuted, fontSize: fontSize.small },
  spacer: { flex: 1 },
});
