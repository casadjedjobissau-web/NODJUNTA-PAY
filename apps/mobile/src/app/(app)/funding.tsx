import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { config } from "../../config";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import { canSimulate, fundingKindLabel, fundingStatusLabel } from "../../lib/funding";
import { formatMoney } from "../../lib/money";
import { formatPhone } from "../../lib/phone";
import { formatDateTime } from "../../lib/statement";
import type { FundingRequestView } from "../../lib/types";
import { colors, fontSize, radius, spacing } from "../../theme";

export default function FundingScreen() {
  const [items, setItems] = useState<FundingRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await api.request<{ items: FundingRequestView[] }>("/v1/funding-requests?limit=30");
      setItems(response.items);
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

  // Só existe com EXPO_PUBLIC_SANDBOX_TOOLS=true (desenvolvimento).
  async function simulate(id: string, outcome: "complete" | "fail") {
    setBusyId(id);
    setError(null);
    try {
      await api.request(`/v1/sandbox/funding-requests/${id}/${outcome}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && items.length === 0 && !error ? (
        <Text style={styles.empty}>Ainda não fez depósitos nem levantamentos.</Text>
      ) : null}

      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.kind}>{fundingKindLabel(item.kind)}</Text>
            <Text style={styles.amount}>{formatMoney(item.amount, item.currency)}</Text>
          </View>
          <Text style={styles.meta}>
            {fundingStatusLabel(item.status)} · {formatDateTime(item.createdAt)}
          </Text>
          {item.destination ? <Text style={styles.meta}>Destino: {formatPhone(item.destination)}</Text> : null}
          <Text style={styles.meta}>Referência {item.id.slice(0, 8).toUpperCase()}</Text>

          {config.sandboxTools && canSimulate(item) ? (
            <View style={styles.simulate}>
              <Text style={styles.sandboxLabel}>Apenas testes</Text>
              <Button
                title="Simular confirmação"
                onPress={() => void simulate(item.id, "complete")}
                loading={busyId === item.id}
                disabled={busyId !== null && busyId !== item.id}
                variant="secondary"
              />
              <Button
                title="Simular falha"
                onPress={() => void simulate(item.id, "fail")}
                disabled={busyId !== null}
                variant="secondary"
              />
            </View>
          ) : null}
        </View>
      ))}

      <Button title="Atualizar" onPress={() => void load()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textMuted, fontSize: fontSize.body },
  error: { color: colors.danger, fontSize: fontSize.body },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kind: { fontSize: fontSize.body, fontWeight: "700", color: colors.text },
  amount: { fontSize: fontSize.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: fontSize.small, color: colors.textMuted },
  simulate: { gap: spacing.sm, marginTop: spacing.sm },
  sandboxLabel: { fontSize: fontSize.small, color: colors.accent, fontWeight: "700" },
});
