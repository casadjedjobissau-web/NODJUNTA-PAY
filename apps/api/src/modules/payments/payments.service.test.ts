import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createPaymentService } from "./payments.service.js";
import type { MerchantPaymentInput } from "./payments.types.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;

const PAYER = "11111111-1111-4111-8111-111111111111";
const MERCHANT_OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeClient(merchant: unknown, rpcHandlers: Record<string, Handler>) {
  const eqCalls: Array<[string, unknown]> = [];
  const state = { fromCalls: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return builder;
    },
    maybeSingle: async () => ({ data: merchant, error: null }),
  };

  const client = {
    from: () => {
      state.fromCalls += 1;
      return builder;
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const handler = rpcHandlers[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
  } as unknown as SupabaseClient;

  return { client, eqCalls, state };
}

function baseHandlers(post: Handler): Record<string, Handler> {
  return {
    create_wallet: (params) => ({
      data: `wallet-${String(params.p_owner_id)}-${String(params.p_type)}`,
      error: null,
    }),
    post_ledger_transfer: post,
  };
}

function activeMerchant(ownerId: string = MERCHANT_OWNER, status = "active") {
  return {
    owner_id: ownerId,
    merchant_code: "AB12CD34",
    business_name: "Loja Teste",
    status,
  };
}

function baseInput(): MerchantPaymentInput {
  return {
    fromUserId: PAYER,
    merchantCode: "AB12CD34",
    amount: 1500,
    idempotencyKey: "pagamento-servico-0001",
    reference: null,
  };
}

const okPost: Handler = () => ({
  data: [{ out_transaction_id: "99999999-9999-4999-8999-999999999999", out_replayed: false }],
  error: null,
});

describe("createPaymentService", () => {
  it("resolveQr devolve null sem consultar a base de dados quando o QR é inválido", async () => {
    const { client, state } = makeClient(null, {});
    const service = createPaymentService(client, "XOF");
    expect(await service.resolveQr("QUALQUER-COISA")).toBeNull();
    expect(state.fromCalls).toBe(0);
  });

  it("resolveQr filtra por código e por comerciante ativo", async () => {
    const { client, eqCalls } = makeClient(
      { merchant_code: "AB12CD34", business_name: "Loja Teste" },
      {},
    );
    const service = createPaymentService(client, "XOF");
    const preview = await service.resolveQr("NJP1:AB12CD34");
    expect(preview).toEqual({ merchantCode: "AB12CD34", businessName: "Loja Teste" });
    expect(eqCalls).toContainEqual(["merchant_code", "AB12CD34"]);
    expect(eqCalls).toContainEqual(["status", "active"]);
  });

  it("404 quando o comerciante não existe", async () => {
    const { client } = makeClient(null, baseHandlers(okPost));
    const service = createPaymentService(client, "XOF");
    await expect(service.payMerchant(baseInput())).rejects.toMatchObject({
      code: "merchant_not_found",
      httpStatus: 404,
    });
  });

  it("422 quando o comerciante não está ativo", async () => {
    const { client } = makeClient(activeMerchant(MERCHANT_OWNER, "pending"), baseHandlers(okPost));
    const service = createPaymentService(client, "XOF");
    await expect(service.payMerchant(baseInput())).rejects.toMatchObject({
      code: "merchant_not_active",
      httpStatus: 422,
    });
  });

  it("400 ao tentar pagar a si próprio", async () => {
    const { client } = makeClient(activeMerchant(PAYER), baseHandlers(okPost));
    const service = createPaymentService(client, "XOF");
    await expect(service.payMerchant(baseInput())).rejects.toMatchObject({
      code: "cannot_pay_self",
      httpStatus: 400,
    });
  });

  it("mapeia NJ004 para insufficient_funds (422)", async () => {
    const { client } = makeClient(
      activeMerchant(),
      baseHandlers(() => ({ data: null, error: { code: "NJ004", message: "saldo insuficiente" } })),
    );
    const service = createPaymentService(client, "XOF");
    await expect(service.payMerchant(baseInput())).rejects.toMatchObject({
      code: "insufficient_funds",
      httpStatus: 422,
    });
  });

  it("envia ao ledger um pagamento de comerciante para a carteira do comerciante", async () => {
    let captured: Record<string, unknown> = {};
    const { client } = makeClient(
      activeMerchant(),
      baseHandlers((params) => {
        captured = params;
        return okPost(params);
      }),
    );
    const service = createPaymentService(client, "XOF");
    const result = await service.payMerchant(baseInput());

    expect(result).toEqual({
      transactionId: "99999999-9999-4999-8999-999999999999",
      replayed: false,
      amount: 1500,
      currency: "XOF",
      merchantCode: "AB12CD34",
      businessName: "Loja Teste",
    });
    expect(captured.p_type).toBe("merchant_payment");
    expect(captured.p_from_account).toBe(`wallet-${PAYER}-user_wallet`);
    expect(captured.p_to_account).toBe(`wallet-${MERCHANT_OWNER}-merchant_wallet`);
    expect(captured.p_initiator).toBe(PAYER);
    expect(captured.p_metadata).toEqual({ merchant_code: "AB12CD34" });
  });
});
