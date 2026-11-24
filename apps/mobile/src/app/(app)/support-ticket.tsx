import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../../design/tokens";
import { api } from "../../lib/api";
import { userMessage } from "../../lib/errors";
import { isUuid } from "../../lib/receipt";
import { formatDateTime } from "../../lib/statement";
import {
  CATEGORY_LABELS,
  MESSAGE_MAX,
  canClose,
  canReply,
  statusLabel,
  validateReply,
  type TicketDetail,
} from "../../lib/support";

export default function SupportTicketScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const ticketId = isUuid(raw) ? raw : null;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(ticketId !== null);
  const [error, setError] = useState<string | null>(ticketId === null ? "Não foi possível abrir este pedido." : null);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (ticketId === null) {
      return;
    }
    try {
      setError(null);
      setTicket(await api.request<TicketDetail>(`/v1/support/tickets/${ticketId}`));
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onReply() {
    const problem = validateReply(reply);
    if (problem) {
      setReplyError(problem);
      return;
    }
    setReplyError(null);
    setSending(true);
    try {
      const updated = await api.request<TicketDetail>(`/v1/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: { message: reply.trim() },
      });
      setTicket(updated);
      setReply("");
    } catch (err) {
      setReplyError(userMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function onClose() {
    setClosing(true);
    try {
      setTicket(await api.request<TicketDetail>(`/v1/support/tickets/${ticketId}/close`, { method: "POST" }));
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brandText} />
      </Screen>
    );
  }

  if (!ticket) {
    return (
      <Screen>
        <Text style={styles.error}>{error ?? "Não foi possível abrir este pedido."}</Text>
        <Button title="Voltar" onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title} accessibilityRole="header">
          {ticket.subject}
        </Text>
        <Text style={styles.meta}>
          {CATEGORY_LABELS[ticket.category]} · {statusLabel(ticket.status)}
        </Text>
      </Card>

      {ticket.messages.map((message) => (
        <Card key={message.id} tone={message.author === "support" ? "brand" : "light"}>
          <Text style={styles.author}>{message.author === "support" ? "Suporte" : "Você"}</Text>
          <Text style={styles.body}>{message.body}</Text>
          <Text style={styles.time}>{formatDateTime(message.createdAt)}</Text>
        </Card>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {canReply(ticket.status) ? (
        <>
          {ticket.status === "resolved" ? (
            <Text style={styles.hint}>Se o problema não ficou resolvido, responda para reabrir o pedido.</Text>
          ) : null}
          <TextField
            label="A sua mensagem"
            value={reply}
            onChangeText={(value) => {
              setReply(value);
              setReplyError(null);
            }}
            placeholder="Escreva aqui"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={MESSAGE_MAX}
            style={styles.multiline}
            error={replyError}
          />
          <Text style={styles.hint}>Nunca escreva o PIN nem códigos SMS.</Text>
          <Button title="Enviar mensagem" onPress={() => void onReply()} loading={sending} disabled={closing} />
          {canClose(ticket.status) ? (
            <Button title="Fechar pedido" onPress={() => void onClose()} loading={closing} disabled={sending} variant="secondary" />
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.hint}>Este pedido está fechado. Se precisar de ajuda, abra um novo pedido.</Text>
          <Button title="Novo pedido de suporte" onPress={() => router.replace("/support-new")} />
        </>
      )}
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
  meta: { fontSize: fontSizes.small, color: colors.textSecondary },
  author: { fontSize: fontSizes.small, fontWeight: fontWeights.heavy, color: colors.textPrimary },
  body: { fontSize: fontSizes.body, lineHeight: lineHeights.body, color: colors.textPrimary },
  time: { fontSize: fontSizes.small, color: colors.textPrimary, opacity: 0.7 },
  multiline: { minHeight: 110, paddingTop: spacing.sm },
  hint: { fontSize: fontSizes.small, color: colors.textSecondary },
  error: { color: colors.error, fontSize: fontSizes.body },
});
