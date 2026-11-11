import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TransferError,
  type TransferInput,
  type TransferResult,
  type TransferService,
} from "./transfers.types.js";

interface RpcError {
  code?: string;
  message: string;
}

function mapPostError(error: RpcError): Error {
  switch (error.code) {
    case "NJ004":
      return new TransferError("insufficient_funds", 422, "Saldo insuficiente.");
    case "NJ003":
      return new TransferError(
        "idempotency_conflict",
        409,
        "A chave de idempotência já foi usada com dados diferentes.",
      );
    case "NJ002":
      return new TransferError("account_unavailable", 422, "Conta indisponível para esta operação.");
    case "NJ005":
      return new TransferError("currency_mismatch", 422, "Moeda incompatível.");
    case "NJ001":
      return new TransferError("invalid_transfer", 400, "Dados da transferência inválidos.");
    default:
      return new Error(`Falha ao registar transferência: ${error.message}`);
  }
}

export function createTransferService(client: SupabaseClient, currency: string): TransferService {
  async function ensureWallet(ownerId: string): Promise<string> {
    const res = await client.rpc("create_wallet", {
      p_owner_id: ownerId,
      p_type: "user_wallet",
      p_currency: currency,
    });
    if (res.error || typeof res.data !== "string") {
      throw new Error(`Falha ao garantir carteira: ${res.error?.message ?? "resposta inesperada"}`);
    }
    return res.data;
  }

  async function createTransfer(input: TransferInput): Promise<TransferResult> {
    const lookup = await client.rpc("find_user_id_by_phone", { p_phone: input.toPhone });
    if (lookup.error) {
      throw new Error(`Falha ao procurar destinatário: ${lookup.error.message}`);
    }
    const recipientId = typeof lookup.data === "string" ? lookup.data : null;
    if (!recipientId) {
      throw new TransferError("recipient_not_found", 404, "Destinatário não encontrado.");
    }
    if (recipientId === input.fromUserId) {
      throw new TransferError(
        "cannot_transfer_to_self",
        400,
        "Não é possível transferir para a própria conta.",
      );
    }

    const fromAccount = await ensureWallet(input.fromUserId);
    const toAccount = await ensureWallet(recipientId);

    const posted = await client.rpc("post_ledger_transfer", {
      p_idempotency_key: input.idempotencyKey,
      p_type: "transfer",
      p_from_account: fromAccount,
      p_to_account: toAccount,
      p_amount: input.amount,
      p_currency: currency,
      p_initiator: input.fromUserId,
      p_reference: input.reference,
      p_metadata: {},
    });
    if (posted.error) {
      throw mapPostError(posted.error);
    }

    const row: unknown = Array.isArray(posted.data) ? posted.data[0] : posted.data;
    const parsed = row as { out_transaction_id?: unknown; out_replayed?: unknown } | null;
    if (
      !parsed ||
      typeof parsed.out_transaction_id !== "string" ||
      typeof parsed.out_replayed !== "boolean"
    ) {
      throw new Error("Resposta inesperada de post_ledger_transfer");
    }

    return {
      transactionId: parsed.out_transaction_id,
      replayed: parsed.out_replayed,
      amount: input.amount,
      currency,
      toPhone: input.toPhone,
    };
  }

  return { createTransfer };
}
