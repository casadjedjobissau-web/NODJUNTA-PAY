import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createFundingService } from "./funding.service.js";
import type { FundingProvider } from "./funding.types.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;
interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

const USER = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ROW = {
  id: REQUEST_ID,
  kind: "deposit",
  status: "pending",
  amount: 5000,
  currency: "XOF",
  destination: null,
  failure_reason: null,
  created_at: "2026-11-10T12:00:00.000Z",
};

function chain(result: { data: unknown; error: null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of ["select", "eq", "is", "order", "limit", "update"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function makeClient(handlers: Record<string, Handler>, row: unknown = ROW) {
  const calls: RpcCall[] = [];
  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push({ fn, params });
      const handler = handlers[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
    from: () => chain({ data: row, error: null }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

function makeProvider(shouldFail = false) {
  const calls: string[] = [];
  const provider: FundingProvider = {
    name: "teste",
    async initiateDeposit(input) {
      calls.push(`deposit:${input.requestId}`);
      if (shouldFail) {
        throw new Error("provedor em baixo");
      }
      return { providerRef: `ref-${input.requestId}` };
    },
    async initiateWithdrawal(input) {
      calls.push(`withdrawal:${input.requestId}`);
      if (shouldFail) {
        throw new Error("provedor em baixo");
      }
      return { providerRef: `ref-${input.requestId}` };
    },
  };
  return { provider, calls };
}

function created(replayed: boolean): Handler {
  return () => ({ data: [{ out_request_id: REQUEST_ID, out_replayed: replayed }], error: null });
}

describe("createFundingService", () => {
  it("createDeposit cria o pedido e chama o provedor uma vez", async () => {
    const { client, calls } = makeClient({ create_deposit_request: created(false) });
    const { provider, calls: providerCalls } = makeProvider();
    const service = createFundingService(client, "XOF", provider);

    const result = await service.createDeposit(USER, 5000, "chave-deposito-0001");

    expect(result.replayed).toBe(false);
    expect(result.request).toMatchObject({ id: REQUEST_ID, kind: "deposit", status: "pending", amount: 5000 });
    expect(providerCalls).toEqual([`deposit:${REQUEST_ID}`]);
    expect(calls[0]?.fn).toBe("create_deposit_request");
    expect(calls[0]?.params).toMatchObject({
      p_user_id: USER,
      p_amount: 5000,
      p_currency: "XOF",
      p_provider: "teste",
    });
  });

  it("createDeposit repetido não volta a chamar o provedor", async () => {
    const { client } = makeClient({ create_deposit_request: created(true) });
    const { provider, calls: providerCalls } = makeProvider();
    const service = createFundingService(client, "XOF", provider);

    const result = await service.createDeposit(USER, 5000, "chave-deposito-0001");

    expect(result.replayed).toBe(true);
    expect(providerCalls).toEqual([]);
  });

  it("mapeia NJ003 para idempotency_conflict (409)", async () => {
    const { client } = makeClient({
      create_deposit_request: () => ({ data: null, error: { code: "NJ003", message: "conflito" } }),
    });
    const { provider } = makeProvider();
    const service = createFundingService(client, "XOF", provider);

    await expect(service.createDeposit(USER, 5000, "chave-deposito-0001")).rejects.toMatchObject({
      code: "idempotency_conflict",
      httpStatus: 409,
    });
  });

  it("levantamento com saldo insuficiente (NJ004) não chama o provedor", async () => {
    const { client } = makeClient({
      create_withdrawal_request: () => ({ data: null, error: { code: "NJ004", message: "saldo" } }),
    });
    const { provider, calls: providerCalls } = makeProvider();
    const service = createFundingService(client, "XOF", provider);

    await expect(
      service.createWithdrawal(USER, 999999, "+245955000099", "chave-levant-0001"),
    ).rejects.toMatchObject({ code: "insufficient_funds", httpStatus: 422 });
    expect(providerCalls).toEqual([]);
  });

  it("falha do provedor marca o pedido como falhado e devolve 502", async () => {
    const { client, calls } = makeClient({
      create_deposit_request: created(false),
      fail_payment_request: () => ({ data: "failed", error: null }),
    });
    const { provider } = makeProvider(true);
    const service = createFundingService(client, "XOF", provider);

    await expect(service.createDeposit(USER, 5000, "chave-deposito-0001")).rejects.toMatchObject({
      code: "provider_unavailable",
      httpStatus: 502,
    });
    const failCall = calls.find((c) => c.fn === "fail_payment_request");
    expect(failCall?.params).toEqual({ p_request_id: REQUEST_ID, p_reason: "provider_error" });
  });

  it("sandboxSettle devolve 404 quando o pedido não pertence ao utilizador", async () => {
    const { client, calls } = makeClient({}, null);
    const { provider } = makeProvider();
    const service = createFundingService(client, "XOF", provider);

    await expect(service.sandboxSettle(USER, REQUEST_ID, "complete")).rejects.toMatchObject({
      code: "request_not_found",
      httpStatus: 404,
    });
    expect(calls).toEqual([]);
  });

  it("sandboxSettle 'complete' chama settle_payment_request", async () => {
    const { client, calls } = makeClient({
      settle_payment_request: () => ({ data: "completed", error: null }),
    });
    const { provider } = makeProvider();
    const service = createFundingService(client, "XOF", provider);

    await service.sandboxSettle(USER, REQUEST_ID, "complete");

    expect(calls).toEqual([{ fn: "settle_payment_request", params: { p_request_id: REQUEST_ID } }]);
  });

  it("sandboxSettle 'fail' chama fail_payment_request com motivo sandbox_fail", async () => {
    const { client, calls } = makeClient({
      fail_payment_request: () => ({ data: "failed", error: null }),
    });
    const { provider } = makeProvider();
    const service = createFundingService(client, "XOF", provider);

    await service.sandboxSettle(USER, REQUEST_ID, "fail");

    expect(calls).toEqual([
      { fn: "fail_payment_request", params: { p_request_id: REQUEST_ID, p_reason: "sandbox_fail" } },
    ]);
  });
});
