import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PhoneChangeError,
  toPhoneChangeStatus,
  type CreatePhoneChangeInput,
  type PhoneChangeItem,
  type PhoneChangeService,
  type PhoneChangeStatus,
} from "./phone-change.types.js";

interface RpcError {
  code?: string;
  message: string;
}

type Row = Record<string, unknown>;

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
      return new PhoneChangeError("invalid_request", 400, "Dados inválidos. Recusar exige um motivo.");
    case "NJ017":
      return new PhoneChangeError(
        "same_person_not_allowed",
        403,
        "Quem abriu o pedido não o pode decidir, e ninguém pode alterar a própria conta.",
      );
    case "NJ030":
      return new PhoneChangeError("phone_unavailable", 409, "Este número já está em uso por outra conta.");
    case "NJ031":
      return new PhoneChangeError("request_not_found", 404, "Pedido de troca de número não encontrado.");
    case "NJ032":
      return new PhoneChangeError(
        "invalid_state",
        409,
        "O pedido já foi decidido, ou já existe um pedido pendente para esta conta ou para este número.",
      );
    case "NJ033":
      return new PhoneChangeError(
        "user_ineligible",
        422,
        "Esta conta não pode mudar de número por este processo.",
      );
    default:
      return new Error(`Falha na troca de número: ${error.message}`);
  }
}

function toItem(row: Row): PhoneChangeItem {
  return {
    id: text(row.id),
    seq: Number(row.seq ?? 0),
    userId: text(row.user_id),
    fullName: str(row.full_name),
    oldPhoneMasked: str(row.old_phone_masked),
    newPhone: text(row.new_phone),
    reason: text(row.reason),
    evidenceNote: text(row.evidence_note),
    status: toPhoneChangeStatus(row.status),
    createdBy: text(row.created_by),
    decidedBy: str(row.decided_by),
    decisionReason: str(row.decision_reason),
    createdAt: text(row.created_at),
    decidedAt: str(row.decided_at),
  };
}

export function createPhoneChangeService(client: SupabaseClient): PhoneChangeService {
  async function list(status: PhoneChangeStatus | null, limit: number): Promise<PhoneChangeItem[]> {
    const { data, error } = await client.rpc("admin_list_phone_changes", {
      p_status: status,
      p_limit: limit,
    });
    if (error) {
      throw mapRpcError(error);
    }
    return rows(data).map(toItem);
  }

  async function create(adminId: string, input: CreatePhoneChangeInput): Promise<{ id: string }> {
    const { data, error } = await client.rpc("admin_phone_change_create", {
      p_admin: adminId,
      p_user: input.userId,
      p_new_phone: input.newPhone,
      p_reason: input.reason,
      p_evidence: input.evidence,
    });
    if (error) {
      throw mapRpcError(error);
    }
    if (typeof data !== "string") {
      throw new Error("Resposta inesperada de admin_phone_change_create");
    }
    return { id: data };
  }

  async function decide(
    adminId: string,
    requestId: string,
    approve: boolean,
    reason: string | null,
  ): Promise<"approved" | "rejected"> {
    const { data, error } = await client.rpc("admin_phone_change_decide", {
      p_admin: adminId,
      p_request: requestId,
      p_approve: approve,
      p_reason: reason,
    });
    if (error) {
      throw mapRpcError(error);
    }
    if (data !== "approved" && data !== "rejected") {
      throw new Error("Resposta inesperada de admin_phone_change_decide");
    }
    return data;
  }

  return { list, create, decide };
}
