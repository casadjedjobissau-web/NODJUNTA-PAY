import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReceiptError,
  type ReceiptDirection,
  type ReceiptKind,
  type ReceiptService,
  type ReceiptView,
} from "./receipts.types.js";

type Row = Record<string, unknown>;

const KINDS: readonly ReceiptKind[] = ["transfer", "merchant_payment", "deposit", "withdrawal", "reversal"];

function firstRow(data: unknown): Row | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row !== null && typeof row === "object" ? (row as Row) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requireText(value: unknown): string {
  const result = text(value);
  if (result === null) {
    throw new Error("Resposta inesperada de get_or_create_receipt");
  }
  return result;
}

function toKind(value: unknown): ReceiptKind {
  const kind = KINDS.find((candidate) => candidate === value);
  if (!kind) {
    throw new Error("Tipo de recibo desconhecido");
  }
  return kind;
}

function toDirection(value: unknown): ReceiptDirection {
  if (value === "in" || value === "out") {
    return value;
  }
  throw new Error("Direção de recibo desconhecida");
}

export function createReceiptService(client: SupabaseClient): ReceiptService {
  async function get(userId: string, transactionId: string): Promise<ReceiptView> {
    const { data, error } = await client.rpc("get_or_create_receipt", {
      p_user: userId,
      p_transaction: transactionId,
    });
    if (error) {
      if (error.code === "NJ021") {
        throw new ReceiptError("receipt_not_available", 404, "Não há recibo para esta operação.");
      }
      if (error.code === "NJ001") {
        throw new ReceiptError("invalid_request", 400, "Pedido de recibo inválido.");
      }
      throw new Error(`Falha ao obter o recibo: ${error.message}`);
    }

    const row = firstRow(data);
    if (!row) {
      throw new Error("Resposta inesperada de get_or_create_receipt");
    }

    const direction = toDirection(row.direction);
    const amount = Number(row.amount);
    const fee = Number(row.fee ?? 0);

    return {
      receiptNumber: requireText(row.receipt_number),
      transactionId: requireText(row.transaction_id),
      kind: toKind(row.kind),
      direction,
      amount,
      fee,
      total: direction === "out" ? amount + fee : amount,
      currency: requireText(row.currency),
      counterparty: {
        label: text(row.counterparty_label),
        detail: text(row.counterparty_detail),
      },
      reference: text(row.reference),
      occurredAt: requireText(row.occurred_at),
      issuedAt: requireText(row.created_at),
    };
  }

  return { get };
}
