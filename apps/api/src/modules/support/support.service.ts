import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_OPEN_TICKETS,
  SupportError,
  toAuthor,
  toCategory,
  toSupportStatus,
  type CreateTicketInput,
  type ListTicketsOptions,
  type SupportService,
  type TicketDetail,
  type TicketMessage,
  type TicketPage,
  type TicketSummary,
} from "./support.types.js";

interface RpcError {
  code?: string;
  message: string;
}

interface TicketRow {
  id: string;
  seq: number;
  category: string;
  subject: string;
  status: string;
  created_at: string;
  last_message_at: string;
}

interface MessageRow {
  id: string;
  seq: number;
  author_type: string;
  body: string;
  created_at: string;
}

const TICKET_COLUMNS = "id, seq, category, subject, status, created_at, last_message_at";
const MESSAGE_COLUMNS = "id, seq, author_type, body, created_at";
const MESSAGE_LIMIT = 200;

function mapRpcError(error: RpcError): Error {
  switch (error.code) {
    case "NJ022":
      return new SupportError(
        "too_many_open_tickets",
        429,
        `Já tem ${MAX_OPEN_TICKETS} pedidos abertos. Aguarde a resposta ou feche algum antes de abrir outro.`,
      );
    case "NJ023":
      return new SupportError("ticket_not_found", 404, "Pedido de suporte não encontrado.");
    case "NJ024":
      return new SupportError("ticket_closed", 409, "Este pedido está fechado. Abra um novo pedido.");
    case "NJ001":
      return new SupportError("invalid_request", 400, "Dados do pedido inválidos.");
    default:
      return new Error(`Falha no suporte: ${error.message}`);
  }
}

function toSummary(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    seq: Number(row.seq),
    category: toCategory(row.category),
    subject: row.subject,
    status: toSupportStatus(row.status),
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

function toMessage(row: MessageRow): TicketMessage {
  return {
    id: row.id,
    seq: Number(row.seq),
    author: toAuthor(row.author_type),
    body: row.body,
    createdAt: row.created_at,
  };
}

export function createSupportService(client: SupabaseClient): SupportService {
  async function read(userId: string, ticketId: string): Promise<TicketDetail> {
    const found = await client
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .eq("id", ticketId)
      .eq("user_id", userId)
      .maybeSingle();
    if (found.error) {
      throw new Error(`Falha ao ler o pedido de suporte: ${found.error.message}`);
    }
    if (!found.data) {
      throw new SupportError("ticket_not_found", 404, "Pedido de suporte não encontrado.");
    }

    const messages = await client
      .from("support_messages")
      .select(MESSAGE_COLUMNS)
      .eq("ticket_id", ticketId)
      .order("seq", { ascending: true })
      .limit(MESSAGE_LIMIT);
    if (messages.error) {
      throw new Error(`Falha ao ler as mensagens: ${messages.error.message}`);
    }

    return {
      ...toSummary(found.data as TicketRow),
      messages: ((messages.data ?? []) as MessageRow[]).map(toMessage),
    };
  }

  async function createTicket(userId: string, input: CreateTicketInput): Promise<TicketDetail> {
    const created = await client.rpc("create_support_ticket", {
      p_user: userId,
      p_category: input.category,
      p_subject: input.subject,
      p_body: input.message,
    });
    if (created.error) {
      throw mapRpcError(created.error);
    }
    if (typeof created.data !== "string") {
      throw new Error("Resposta inesperada de create_support_ticket");
    }
    return read(userId, created.data);
  }

  async function list(userId: string, options: ListTicketsOptions): Promise<TicketPage> {
    let query = client
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .eq("user_id", userId)
      .order("seq", { ascending: false })
      .limit(options.limit + 1);
    if (options.before !== undefined) {
      query = query.lt("seq", options.before);
    }

    const result = await query;
    if (result.error) {
      throw new Error(`Falha ao listar pedidos de suporte: ${result.error.message}`);
    }

    const rows = (result.data ?? []) as unknown as TicketRow[];
    const hasMore = rows.length > options.limit;
    const items = (hasMore ? rows.slice(0, options.limit) : rows).map(toSummary);
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? last.seq : null };
  }

  async function reply(userId: string, ticketId: string, message: string): Promise<TicketDetail> {
    const added = await client.rpc("add_support_message", {
      p_user: userId,
      p_ticket: ticketId,
      p_body: message,
    });
    if (added.error) {
      throw mapRpcError(added.error);
    }
    return read(userId, ticketId);
  }

  async function close(userId: string, ticketId: string): Promise<TicketDetail> {
    const closed = await client.rpc("close_support_ticket", { p_user: userId, p_ticket: ticketId });
    if (closed.error) {
      throw mapRpcError(closed.error);
    }
    return read(userId, ticketId);
  }

  return { createTicket, list, get: read, reply, close };
}
