import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FundingError,
  type FundingKind,
  type FundingProvider,
  type FundingRequestView,
  type FundingResult,
  type FundingService,
  type FundingStatus,
  type SandboxOutcome,
} from "./funding.types.js";

interface RpcError {
  code?: string;
  message: string;
}

interface RequestRow {
  id: string;
  kind: string;
  status: string;
  amount: number;
  currency: string;
  destination: string | null;
  failure_reason: string | null;
  created_at: string;
}

const COLUMNS = "id, kind, status, amount, currency, destination, failure_reason, created_at";

function toKind(value: string): FundingKind {
  return value === "withdrawal" ? "withdrawal" : "deposit";
}

function toStatus(value: string): FundingStatus {
  if (value === "completed" || value === "failed") {
    return value;
  }
  return "pending";
}

function toView(row: RequestRow): FundingRequestView {
  return {
    id: row.id,
    kind: toKind(row.kind),
    status: toStatus(row.status),
    amount: Number(row.amount),
    currency: row.currency,
    destination: row.destination,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

function mapRpcError(error: RpcError): Error {
  switch (error.code) {
    case "NJ004":
      return new FundingError("insufficient_funds", 422, "Saldo insuficiente.");
    case "NJ003":
      return new FundingError(
        "idempotency_conflict",
        409,
        "A chave de idempotência já foi usada com dados diferentes.",
      );
    case "NJ001":
      return new FundingError("invalid_request", 400, "Dados do pedido inválidos.");
    case "NJ009":
      return new FundingError("invalid_state", 409, "O pedido já não está pendente.");
    case "NJ010":
      return new FundingError("request_not_found", 404, "Pedido não encontrado.");
    case "NJ002":
      return new FundingError("account_unavailable", 422, "Conta indisponível para esta operação.");
    default:
      return new Error(`Falha na operação de fundos: ${error.message}`);
  }
}

function parseCreated(data: unknown): { id: string; replayed: boolean } {
  const row: unknown = Array.isArray(data) ? data[0] : data;
  const parsed = row as { out_request_id?: unknown; out_replayed?: unknown } | null;
  if (!parsed || typeof parsed.out_request_id !== "string" || typeof parsed.out_replayed !== "boolean") {
    throw new Error("Resposta inesperada ao criar pedido de fundos");
  }
  return { id: parsed.out_request_id, replayed: parsed.out_replayed };
}

export function createFundingService(
  client: SupabaseClient,
  currency: string,
  provider: FundingProvider,
): FundingService {
  async function readOwned(userId: string, requestId: string): Promise<FundingRequestView | null> {
    const { data, error } = await client
      .from("payment_requests")
      .select(COLUMNS)
      .eq("id", requestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new Error(`Falha ao ler pedido: ${error.message}`);
    }
    return data ? toView(data as RequestRow) : null;
  }

  async function mustReadOwned(userId: string, requestId: string): Promise<FundingRequestView> {
    const view = await readOwned(userId, requestId);
    if (!view) {
      throw new Error("Pedido não encontrado após criação");
    }
    return view;
  }

  async function attachProviderRef(requestId: string, providerRef: string): Promise<void> {
    const { error } = await client
      .from("payment_requests")
      .update({ provider_ref: providerRef })
      .eq("id", requestId)
      .is("provider_ref", null);
    if (error) {
      throw new Error(`Falha ao guardar referência do provedor: ${error.message}`);
    }
  }

  async function failAfterProviderError(requestId: string): Promise<never> {
    // Para levantamentos isto devolve o valor retido à carteira.
    await client.rpc("fail_payment_request", {
      p_request_id: requestId,
      p_reason: "provider_error",
    });
    throw new FundingError("provider_unavailable", 502, "Provedor indisponível. Tente mais tarde.");
  }

  async function createDeposit(
    userId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<FundingResult> {
    const created = await client.rpc("create_deposit_request", {
      p_user_id: userId,
      p_amount: amount,
      p_currency: currency,
      p_provider: provider.name,
      p_idempotency_key: idempotencyKey,
    });
    if (created.error) {
      throw mapRpcError(created.error);
    }
    const { id, replayed } = parseCreated(created.data);

    if (!replayed) {
      try {
        const response = await provider.initiateDeposit({ requestId: id, userId, amount, currency });
        await attachProviderRef(id, response.providerRef);
      } catch {
        return failAfterProviderError(id);
      }
    }
    return { request: await mustReadOwned(userId, id), replayed };
  }

  async function createWithdrawal(
    userId: string,
    amount: number,
    destination: string,
    idempotencyKey: string,
  ): Promise<FundingResult> {
    const created = await client.rpc("create_withdrawal_request", {
      p_user_id: userId,
      p_amount: amount,
      p_currency: currency,
      p_provider: provider.name,
      p_destination: destination,
      p_idempotency_key: idempotencyKey,
    });
    if (created.error) {
      throw mapRpcError(created.error);
    }
    const { id, replayed } = parseCreated(created.data);

    if (!replayed) {
      try {
        const response = await provider.initiateWithdrawal({
          requestId: id,
          userId,
          amount,
          currency,
          destination,
        });
        await attachProviderRef(id, response.providerRef);
      } catch {
        return failAfterProviderError(id);
      }
    }
    return { request: await mustReadOwned(userId, id), replayed };
  }

  async function list(userId: string, limit: number): Promise<FundingRequestView[]> {
    const { data, error } = await client
      .from("payment_requests")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw new Error(`Falha ao listar pedidos: ${error.message}`);
    }
    return ((data ?? []) as RequestRow[]).map(toView);
  }

  async function sandboxSettle(
    userId: string,
    requestId: string,
    outcome: SandboxOutcome,
  ): Promise<FundingRequestView> {
    const owned = await readOwned(userId, requestId);
    if (!owned) {
      throw new FundingError("request_not_found", 404, "Pedido não encontrado.");
    }

    const result =
      outcome === "complete"
        ? await client.rpc("settle_payment_request", { p_request_id: requestId })
        : await client.rpc("fail_payment_request", {
            p_request_id: requestId,
            p_reason: "sandbox_fail",
          });
    if (result.error) {
      throw mapRpcError(result.error);
    }
    return mustReadOwned(userId, requestId);
  }

  return { createDeposit, createWithdrawal, list, sandboxSettle };
}
