import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { Button } from "../../components/Button";
import { MovementRow } from "../../components/MovementRow";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import type { StatementEntry, StatementPage } from "../../lib/types";
import { colors, fontSize } from "../../theme";

const PAGE_SIZE = 20;

export default function StatementScreen() {
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
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {!loading && items.length === 0 && !error ? (
        <Text style={styles.empty}>Ainda não tem movimentos.</Text>
      ) : null}
      {items.map((entry) => (
        <MovementRow key={entry.id} entry={entry} />
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {cursor !== null ? (
        <Button title="Carregar mais" onPress={onLoadMore} loading={loadingMore} variant="secondary" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textMuted, fontSize: fontSize.body },
  error: { color: colors.danger, fontSize: fontSize.body },
});
