import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FRAUD_ALERT_STATUSES,
  FraudError,
  type FraudAdminService,
  type FraudAlertItem,
  type FraudAlertStatus,
} from "./fraud.types.js";

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
      return new FraudError("invalid_request", 400, "Dados inválidos. A nota pode ter no máximo 300 caracteres.");
    case "NJ017":
      return new FraudError("not_allowed_on_self", 403, "Não pode tratar alertas da sua própria conta.");
    case "NJ034":
      return new FraudError("alert_not_found", 404, "Alerta não encontrado.");
    default:
      return new Error(`Falha na gestão de alertas: ${error.message}`);
  }
}

function toStatus(value: unknown): FraudAlertStatus {
  return FRAUD_ALERT_STATUSES.find((status) => status === value) ?? "open";
}

function toItem(row: Row): FraudAlertItem {
  const details =
    typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  return {
    id: text(row.id),
    seq: Number(row.seq ?? 0),
    userId: text(row.user_id),
    fullName: str(row.full_name),
    phoneMasked: str(row.phone_masked),
    rule: text(row.rule),
    decision: row.decision === "block" ? "block" : "flag",
    operation: text(row.operation),
    amount: Number(row.amount ?? 0),
    details,
    status: toStatus(row.status),
    reviewedBy: str(row.reviewed_by),
    reviewedAt: str(row.reviewed_at),
    reviewNote: str(row.review_note),
    createdAt: text(row.created_at),
  };
}

export function createFraudAdminService(client: SupabaseClient): FraudAdminService {
  async function list(status: FraudAlertStatus | null, limit: number): Promise<FraudAlertItem[]> {
    const { data, error } = await client.rpc("admin_list_fraud_alerts", { p_status: status, p_limit: limit });
    if (error) {
      throw mapRpcError(error);
    }
    return rows(data).map(toItem);
  }

  async function review(adminId: string, alertId: string, note: string | null): Promise<"reviewed"> {
    const { data, error } = await client.rpc("admin_review_fraud_alert", {
      p_admin: adminId,
      p_alert: alertId,
      p_note: note,
    });
    if (error) {
      throw mapRpcError(error);
    }
    if (data !== "reviewed") {
      throw new Error("Resposta inesperada de admin_review_fraud_alert");
    }
    return "reviewed";
  }

  return { list, review };
}
