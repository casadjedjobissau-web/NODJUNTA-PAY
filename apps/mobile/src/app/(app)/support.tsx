import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { SectionHeader } from "../../components/SectionHeader";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../../design/tokens";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import { formatRelativeTime } from "../../lib/notifications";
import {
  CATEGORY_LABELS,
  FALLBACK_CONTACTS,
  contactsFrom,
  statusLabel,
  telUrl,
  type SupportContact,
  type TicketPage,
  type TicketSummary,
} from "../../lib/support";

const PAGE_SIZE = 20;

export default function SupportScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<SupportContact[]>([...FALLBACK_CONTACTS]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const page = await api.request<TicketPage>(`/v1/support/tickets?limit=${PAGE_SIZE}`);
      setTickets(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContacts = useCallback(() => {
    api
      .request<unknown>("/public/support")
      .then((raw) => setContacts(contactsFrom(raw)))
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      loadContacts();
    }, [load, loadContacts]),
  );

  async function onLoadMore() {
    if (cursor === null) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await api.request<TicketPage>(`/v1/support/tickets?limit=${PAGE_SIZE}&before=${cursor}`);
      setTickets((current) => [...current, ...page.items.filter((item) => !current.some((known) => known.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function onCall(contact: SupportContact) {
    const url = telUrl(contact.e164);
    setCallError(null);
    if (!url) {
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setCallError("Não foi possível abrir o marcador do telemóvel. Ligue para o número mostrado.");
    }
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title} accessibilityRole="header">
          Fale com o suporte
        </Text>
        <Text style={styles.text}>Pode ligar-nos, ou abrir um pedido abaixo e responderemos na app.</Text>
        {contacts.map((contact) => (
          <Button
            key={contact.e164}
            title={`Ligar ${contact.display}`}
            onPress={() => void onCall(contact)}
            variant="secondary"
          />
        ))}
        {callError ? <Text style={styles.error}>{callError}</Text> : null}
        <Text style={styles.warning}>O suporte nunca lhe pede o PIN nem o código SMS.</Text>
      </Card>

      <Button title="Novo pedido de suporte" onPress={() => router.push("/support-new")} />

      <SectionHeader title="Os meus pedidos" />
      {loading ? <ActivityIndicator color={colors.brandText} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && tickets.length === 0 ? <Text style={styles.text}>Ainda não abriu nenhum pedido.</Text> : null}

      {tickets.length > 0 ? (
        <Card padded={false} style={styles.list}>
          {tickets.map((ticket, index) => (
            <ListRow
              key={ticket.id}
              title={ticket.subject}
              subtitle={`${CATEGORY_LABELS[ticket.category]} · ${statusLabel(ticket.status)}`}
              left={<Icon name="support" color={colors.brandText} />}
              right={
                <View style={styles.meta}>
                  <Text style={styles.time}>{formatRelativeTime(ticket.lastMessageAt)}</Text>
                  {ticket.status === "pending_user" ? <View style={styles.dot} accessibilityLabel="Tem resposta" /> : null}
                </View>
              }
              onPress={() => router.push({ pathname: "/support-ticket", params: { id: ticket.id } })}
              last={index === tickets.length - 1}
            />
          ))}
        </Card>
      ) : null}

      {cursor !== null ? (
        <Button title="Carregar mais" onPress={() => void onLoadMore()} loading={loadingMore} variant="secondary" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.title,
    lineHeight: lineHeights.title,
    fontWeight: fontWeights.heavy,
    color: colors.textPrimary,
  },
  text: { fontSize: fontSizes.body, lineHeight: lineHeights.body, color: colors.textSecondary },
  warning: { fontSize: fontSizes.small, color: colors.textSecondary, marginTop: spacing.xs },
  error: { color: colors.error, fontSize: fontSizes.body },
  list: { paddingHorizontal: spacing.md },
  meta: { alignItems: "flex-end", gap: spacing.xs },
  time: { fontSize: fontSizes.small, color: colors.textSecondary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
});
