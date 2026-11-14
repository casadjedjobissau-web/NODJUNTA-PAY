import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditService } from "../audit/audit.types.js";
import type { AdminTicketDetail, AdminTicketItem, SupportAdminService } from "./support.admin.types.js";
import {
  SupportError,
  toAuthor,
  toCategory,
  toSupportStatus,
  type SupportStatus,
  type TicketMessage,
} from "./support.types.js";

interface RpcError {
  code?: string;
  message: string;
}

type Row = Record<string, unknown>;

interface MessageRow {
  id: string;
  seq: number;
  author_type: string;
  body: string;
  created_at: string;
}

const MESSAGE_LIMIT = 200;

function rows(data: unknown): Row[] {
  if (Array.isArray(data)) {
    return data as Row[];
  }
  return data ? [data as Row] : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapRpcError(error: RpcError): Error {
  switch (error.code) {
    case "NJ001":
      return new SupportError("invalid_request", 400, "Dados inválidos.");
    case "NJ017":
      return new SupportError(
        "not_allowed_on_self",
        403,
        "Não pode tratar os seus próprios pedidos de suporte.",
      );
    case "NJ023":
      return new SupportError("ticket_not_found", 404, "Pedido de suporte não encontrado.");
    case "NJ024":
      return new SupportError("ticket_closed", 409, "Este pedido está fechado.");
    default:
      return new Error(`Falha na gestão do suporte: ${error.message}`);
  }
}

function toItem(row: Row): AdminTicketItem {
  return {
    id: text(row.id),
    seq: Number(row.seq ?? 0),
    userId: text(row.user_id),
    phone: str(row.phone),
    fullName: str(row.full_name),
    category: toCategory(row.category),
    subject: text(row.subject),
    status: toSupportStatus(row.status),
    createdAt: text(row.created_at),
    lastMessageAt: text(row.last_message_at),
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

export function createSupportAdminService(client: SupabaseClient, audit: AuditService): SupportAdminService {
  async function list(status: SupportStatus | null, limit: number): Promise<AdminTicketItem[]> {
    const { data, error } = await client.rpc("admin_list_support_tickets", {
      p_status: status,
      p_limit: limit,
    });
    if (error) {
      throw new Error(`Falha ao listar pedidos de suporte: ${error.message}`);
    }
    return rows(data).map(toItem);
  }

  async function get(adminId: string, ticketId: string, ip: string | null): Promise<AdminTicketDetail> {
    const { data, error } = await client.rpc("admin_get_support_ticket", { p_ticket: ticketId });
    if (error) {
      throw new Error(`Falha ao ler o pedido de suporte: ${error.message}`);
    }
    const row = rows(data)[0];
    if (!row) {
      throw new SupportError("ticket_not_found", 404, "Pedido de suporte não encontrado.");
    }

    // O conteúdo de um pedido pode ter dados pessoais: a consulta é auditada ANTES de o devolver.
    await audit.record({
      actorId: adminId,
      actorType: "admin",
      action: "ADMIN_SUPPORT_TICKET_VIEW",
      entityType: "support_ticket",
      entityId: ticketId,
      ip,
      metadata: {},
    });

    const messages = await client
      .from("support_messages")
      .select("id, seq, author_type, body, created_at")
      .eq("ticket_id", ticketId)
      .order("seq", { ascending: true })
      .limit(MESSAGE_LIMIT);
    if (messages.error) {
      throw new Error(`Falha ao ler as mensagens: ${messages.error.message}`);
    }

    return { ...toItem(row), messages: ((messages.data ?? []) as MessageRow[]).map(toMessage) };
  }

  async function reply(adminId: string, ticketId: string, message: string, resolve: boolean): Promise<void> {
    const { error } = await client.rpc("admin_support_reply", {
      p_admin: adminId,
      p_ticket: ticketId,
      p_body: message,
      p_resolve: resolve,
    });
    if (error) {
      throw mapRpcError(error);
    }
  }

  async function setStatus(
    adminId: string,
    ticketId: string,
    status: "open" | "resolved" | "closed",
  ): Promise<"open" | "resolved" | "closed"> {
    const { data, error } = await client.rpc("admin_support_set_status", {
      p_admin: adminId,
      p_ticket: ticketId,
      p_status: status,
    });
    if (error) {
      throw mapRpcError(error);
    }
    if (data !== "open" && data !== "resolved" && data !== "closed") {
      throw new Error("Resposta inesperada de admin_support_set_status");
    }
    return data;
  }

  return { list, get, reply, setStatus };
}
