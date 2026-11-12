import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import { describeFee, describeUsage, operationLabel } from "../../lib/limits";
import { formatMoney } from "../../lib/money";
import type { LimitsView } from "../../lib/types";
import { colors, fontSize, radius, spacing } from "../../theme";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function LimitsScreen() {
  const router = useRouter();
  const [data, setData] = useState<LimitsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.request<LimitsView>("/v1/limits"));
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

  return (
    <Screen>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data ? (
        <>
          <Text style={styles.intro}>
            O seu nível de verificação é o nível {data.kycLevel}. Subir de nível aumenta os limites.
          </Text>

          {data.operations.map((op) => (
            <View key={op.operation} style={styles.card}>
              <Text style={styles.cardTitle}>{operationLabel(op.operation)}</Text>
              {op.allowed ? (
                <>
                  <Row
                    label="Por operação"
                    value={op.perTransaction === null ? "—" : formatMoney(op.perTransaction, data.currency)}
                  />
                  {op.day ? <Row label="Hoje" value={describeUsage(op.day, data.currency)} /> : null}
                  {op.month ? <Row label="Este mês" value={describeUsage(op.month, data.currency)} /> : null}
                </>
              ) : (
                <Text style={styles.muted}>Não disponível no seu nível de verificação.</Text>
              )}
              <Row label="Tarifa" value={describeFee(op.fee, data.currency)} />
            </View>
          ))}

          <Button title="Aumentar os meus limites" onPress={() => router.push("/kyc")} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: fontSize.body, color: colors.textMuted },
  error: { color: colors.danger, fontSize: fontSize.body },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: fontSize.body, fontWeight: "800", color: colors.text },
  row: { gap: 2 },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: "600" },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: "600" },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
});
