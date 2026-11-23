import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { MovementRow } from "../../components/MovementRow";
import { Screen } from "../../components/Screen";
import { colors, fontSizes, spacing } from "../../design/tokens";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import { receiptTarget } from "../../lib/receipt";
import type { StatementEntry, StatementPage } from "../../lib/types";

const PAGE_SIZE = 20;

export default function StatementScreen() {
  const router = useRouter();
  const [items, setItems] = useState<StatementEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback((before?: number) => {
    const query = before === undefined ? `?limit=${PAGE_SIZE}` : `?limit=${PAGE_SIZE}&before=${before}`;
    return api.request<StatementPage>(`/v1/wallet/statement${query}`);
  }, []);

  useEffect(() => {
    fetchPage()
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((err: unknown) => setError(userMessage(err)))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  async function onLoadMore() {
    if (cursor === null) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPage(cursor);
      setItems((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Screen>
      {loading ? <ActivityIndicator color={colors.brandText} /> : null}
      {!loading && items.length === 0 && !error ? (
        <Text style={styles.empty}>Ainda não tem movimentos.</Text>
      ) : null}
      {items.length > 0 ? (
        <>
          <Text style={styles.hint}>Toque num movimento para ver o recibo.</Text>
          <Card padded={false} style={styles.card}>
            {items.map((entry, index) => {
              const target = receiptTarget(entry);
              return (
                <MovementRow
                  key={entry.id}
                  entry={entry}
                  last={index === items.length - 1}
                  onPress={
                    target ? () => router.push({ pathname: "/receipt", params: { transactionId: target } }) : undefined
                  }
                />
              );
            })}
          </Card>
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {cursor !== null ? (
        <Button title="Carregar mais" onPress={() => void onLoadMore()} loading={loadingMore} variant="secondary" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: spacing.md },
  empty: { color: colors.textSecondary, fontSize: fontSizes.body },
  hint: { color: colors.textSecondary, fontSize: fontSizes.small },
  error: { color: colors.error, fontSize: fontSizes.body },
});
