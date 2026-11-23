import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { colors, fontSizes, fontWeights, spacing } from "../../design/tokens";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import {
  applyRead,
  applyReadAll,
  formatRelativeTime,
  mergePages,
  notificationIcon,
  unreadLabel,
  type NotificationPage,
  type NotificationView,
} from "../../lib/notifications";
import { useUnread } from "../../lib/unread";

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const { setUnread } = useUnread();
  const [items, setItems] = useState<NotificationView[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [unread, setUnreadLocal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(
    (count: number) => {
      setUnreadLocal(count);
      setUnread(count);
    },
    [setUnread],
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      const page = await api.request<NotificationPage>(`/v1/notifications?limit=${PAGE_SIZE}`);
      setItems(page.items);
      setCursor(page.nextCursor);
      sync(page.unreadCount);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sync]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onLoadMore() {
    if (cursor === null) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await api.request<NotificationPage>(`/v1/notifications?limit=${PAGE_SIZE}&before=${cursor}`);
      setItems((current) => mergePages(current, page.items));
      setCursor(page.nextCursor);
      sync(page.unreadCount);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function onOpen(item: NotificationView) {
    if (item.read) {
      return;
    }
    const next = applyRead(items, unread, item.id);
    setItems(next.items);
    sync(next.unread);
    try {
      await api.request(`/v1/notifications/${item.id}/read`, { method: "POST" });
    } catch (err) {
      setError(userMessage(err));
      void load();
    }
  }

  async function onReadAll() {
    const next = applyReadAll(items);
    setItems(next.items);
    sync(next.unread);
    try {
      await api.request("/v1/notifications/read-all", { method: "POST" });
    } catch (err) {
      setError(userMessage(err));
      void load();
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brandText} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {unreadLabel(unread)}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.length === 0 && !error ? (
        <Text style={styles.empty}>Ainda não tem notificações.</Text>
      ) : (
        <Card padded={false} style={styles.card}>
          {items.map((item, index) => (
            <ListRow
              key={item.id}
              title={item.title}
              subtitle={item.body}
              left={<Icon name={notificationIcon(item.kind)} color={item.read ? colors.textSecondary : colors.brandText} />}
              right={
                <View style={styles.meta}>
                  <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
                  {item.read ? null : <View style={styles.dot} accessibilityLabel="Não lida" />}
                </View>
              }
              onPress={() => void onOpen(item)}
              last={index === items.length - 1}
            />
          ))}
        </Card>
      )}

      {cursor !== null ? (
        <Button title="Carregar mais" onPress={() => void onLoadMore()} loading={loadingMore} variant="secondary" />
      ) : null}
      {unread > 0 ? <Button title="Marcar todas como lidas" onPress={() => void onReadAll()} variant="secondary" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { fontSize: fontSizes.body, fontWeight: fontWeights.bold, color: colors.textPrimary },
  card: { paddingHorizontal: spacing.md },
  empty: { fontSize: fontSizes.body, color: colors.textSecondary },
  error: { color: colors.error, fontSize: fontSizes.body },
  meta: { alignItems: "flex-end", gap: spacing.xs },
  time: { fontSize: fontSizes.small, color: colors.textSecondary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
});
