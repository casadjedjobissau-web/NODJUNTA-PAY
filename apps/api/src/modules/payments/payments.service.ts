import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLimitError } from "../../lib/db-errors.js";
import { isMerchantCode, parseQrPayload } from "../merchants/qr.js";
import {
  PaymentError,
  type MerchantPaymentInput,
  type MerchantPaymentResult,
  type MerchantPreview,
  type PaymentService,
} from "./payments.types.js";

interface RpcError {
  code?: string;
  message: string;
}

interface MerchantRow {
  owner_id: string;
  merchant_code: string;
  business_name: string;
  status: string;
}

function mapPostError(error: RpcError): Error {
  switch (error.code) {
    case "NJ004":
      return new PaymentError("insufficient_funds", 422, "Saldo insuficiente.");
    case "NJ003":
      return new PaymentError(
        "idempotency_conflict",
        409,
        "A chave de idempotência já foi usada com dados diferentes.",
      );
    case "NJ002":
      return new PaymentError("account_unavailable", 422, "Conta indisponível para esta operação.");
    case "NJ005":
      return new PaymentError("currency_mismatch", 422, "Moeda incompatível.");
    case "NJ001":
      return new PaymentError("invalid_payment", 400, "Dados do pagamento inválidos.");
    default: {
      const limit = mapLimitError(error.code);
      if (limit) {
        return new PaymentError(limit.code, limit.httpStatus, limit.message);
      }
      return new Error(`Falha ao registar pagamento: ${error.message}`);
    }
  }
}

export function createPaymentService(client: SupabaseClient, currency: string): PaymentService {
  async function ensureWallet(ownerId: string, type: "user_wallet" | "merchant_wallet"): Promise<string> {
    const res = await client.rpc("create_wallet", {
      p_owner_id: ownerId,
      p_type: type,
      p_currency: currency,
    });
    if (res.error || typeof res.data !== "string") {
      throw new Error(`Falha ao garantir carteira: ${res.error?.message ?? "resposta inesperada"}`);
    }
    return res.data;
  }

  async function resolveQr(payload: string): Promise<MerchantPreview | null> {
    const code = parseQrPayload(payload);
    if (!code) {
      return null;
    }
    const { data, error } = await client
      .from("merchants")
      .select("merchant_code, business_name")
      .eq("merchant_code", code)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      throw new Error(`Falha ao procurar comerciante: ${error.message}`);
    }
    if (!data) {
      return null;
    }
    const row = data as { merchant_code: string; business_name: string };
    return { merchantCode: row.merchant_code, businessName: row.business_name };
  }

  async function payMerchant(input: MerchantPaymentInput): Promise<MerchantPaymentResult> {
    if (!isMerchantCode(input.merchantCode)) {
      throw new PaymentError("invalid_merchant_code", 400, "Código de comerciante inválido.");
    }

    const found = await client
      .from("merchants")
      .select("owner_id, merchant_code, business_name, status")
      .eq("merchant_code", input.merchantCode)
      .maybeSingle();
    if (found.error) {
      throw new Error(`Falha ao procurar comerciante: ${found.error.message}`);
    }
    if (!found.data) {
      throw new PaymentError("merchant_not_found", 404, "Comerciante não encontrado.");
    }
    const merchant = found.data as MerchantRow;
    if (merchant.status !== "active") {
      throw new PaymentError("merchant_not_active", 422, "Este comerciante não está ativo.");
    }
    if (merchant.owner_id === input.fromUserId) {
      throw new PaymentError("cannot_pay_self", 400, "Não é possível pagar a si próprio.");
    }

    const fromAccount = await ensureWallet(input.fromUserId, "user_wallet");
    const toAccount = await ensureWallet(merchant.owner_id, "merchant_wallet");

    const posted = await client.rpc("post_ledger_transfer", {
      p_idempotency_key: input.idempotencyKey,
      p_type: "merchant_payment",
      p_from_account: fromAccount,
      p_to_account: toAccount,
      p_amount: input.amount,
      p_currency: currency,
      p_initiator: input.fromUserId,
      p_reference: input.reference,
      p_metadata: { merchant_code: merchant.merchant_code },
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
      merchantCode: merchant.merchant_code,
      businessName: merchant.business_name,
    };
  }

  return { resolveQr, payMerchant };
}
