import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { MovementRow } from "../../../components/MovementRow";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { WovenBand } from "../../../design/WovenBand";
import { colors, fontSizes, fontWeights, spacing } from "../../../design/tokens";
import { api } from "../../../lib/api";
import { userMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { receiptTarget } from "../../../lib/receipt";
import type { StatementEntry, StatementPage, WalletView } from "../../../lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
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

  const bandWidth = width - spacing.lg * 2;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Card tone="dark" padded={false}>
        <View style={styles.balanceBody}>
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
        <WovenBand width={bandWidth} cell={12} />
      </Card>

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
          <Button title="Tentar novamente" onPress={() => void onRefresh()} variant="secondary" />
        </View>
      ) : null}

      <SectionHeader title="Últimos movimentos" />
      {recent.length === 0 && !loading && !error ? <Text style={styles.empty}>Ainda não tem movimentos.</Text> : null}
      {recent.length > 0 ? (
        <Card padded={false} style={styles.list}>
          {recent.map((entry, index) => {
            const target = receiptTarget(entry);
            return (
              <MovementRow
                key={entry.id}
                entry={entry}
                currency={wallet?.currency}
                last={index === recent.length - 1}
                onPress={
                  target ? () => router.push({ pathname: "/receipt", params: { transactionId: target } }) : undefined
                }
              />
            );
          })}
        </Card>
      ) : null}
      {recent.length > 0 ? (
        <Button title="Ver extrato completo" onPress={() => router.push("/statement")} variant="secondary" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceBody: { padding: spacing.lg, gap: spacing.sm },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: colors.surface, opacity: 0.85, fontSize: fontSizes.small, fontWeight: fontWeights.semibold },
  toggle: { color: colors.brand, fontSize: fontSizes.small, fontWeight: fontWeights.bold },
  balance: { color: colors.surface, fontSize: fontSizes.display, fontWeight: fontWeights.heavy },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { flex: 1 },
  errorBox: { gap: spacing.sm },
  errorText: { color: colors.error, fontSize: fontSizes.body },
  empty: { color: colors.textSecondary, fontSize: fontSizes.body },
  list: { paddingHorizontal: spacing.md },
});
