import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { OptionList } from "../../components/OptionList";
import { Screen } from "../../components/Screen";
import { SectionHeader } from "../../components/SectionHeader";
import { TextField } from "../../components/TextField";
import { colors, fontSizes, spacing } from "../../design/tokens";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { userMessage } from "../../lib/errors";
import {
  CATEGORY_LABELS,
  MESSAGE_MAX,
  SUBJECT_MAX,
  SUPPORT_CATEGORIES,
  validateNewTicket,
  type NewTicketErrors,
  type SupportCategory,
  type TicketDetail,
} from "../../lib/support";

const OPTIONS = SUPPORT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

export default function SupportNewScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<NewTicketErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSend() {
    const result = validateNewTicket({ category, subject, message });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setError(null);
    setSending(true);
    try {
      const ticket = await api.request<TicketDetail>("/v1/support/tickets", {
        method: "POST",
        body: result.value,
      });
      router.replace({ pathname: "/support-ticket", params: { id: ticket.id } });
    } catch (err) {
      // Criar um pedido não é idempotente: com a ligação em dúvida, o pedido pode já ter sido criado.
      if (err instanceof ApiError && err.code === "network_error") {
        setError("Sem ligação. Veja em Suporte se o pedido já foi enviado antes de tentar outra vez.");
      } else {
        setError(userMessage(err));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <SectionHeader title="Sobre o que é?" />
      <OptionList
        options={OPTIONS}
        selected={category}
        onSelect={(value) => {
          setCategory(value);
          setErrors((current) => ({ ...current, category: undefined }));
        }}
      />
      {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}

      <TextField
        label="Assunto"
        value={subject}
        onChangeText={(value) => {
          setSubject(value);
          setErrors((current) => ({ ...current, subject: undefined }));
        }}
        placeholder="Ex.: Pagamento em falta"
        maxLength={SUBJECT_MAX}
        error={errors.subject}
      />
      <TextField
        label="Mensagem"
        value={message}
        onChangeText={(value) => {
          setMessage(value);
          setErrors((current) => ({ ...current, message: undefined }));
        }}
        placeholder="Descreva o que aconteceu"
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        maxLength={MESSAGE_MAX}
        style={styles.multiline}
        error={errors.message}
      />
      <Text style={styles.warning}>
        Nunca escreva o PIN, códigos SMS nem números de documentos neste pedido. O suporte não precisa deles.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Enviar pedido" onPress={() => void onSend()} loading={sending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 140, paddingTop: spacing.sm },
  warning: { fontSize: fontSizes.small, color: colors.textSecondary },
  error: { color: colors.error, fontSize: fontSizes.body },
});
