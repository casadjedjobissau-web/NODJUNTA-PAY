import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createTransferService } from "./transfers.service.js";
import { TransferError, type TransferInput } from "./transfers.types.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;

const SENDER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "66666666-6666-4666-8666-666666666666";

function fakeClient(handlers: Record<string, Handler>): SupabaseClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const handler = handlers[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
  } as unknown as SupabaseClient;
}

function baseInput(): TransferInput {
  return {
    fromUserId: SENDER,
    toPhone: "+245955000002",
    amount: 1000,
    idempotencyKey: "chave-servico-0001",
    reference: null,
  };
}

function baseHandlers(post: Handler, lookupId: string | null = RECIPIENT): Record<string, Handler> {
  return {
    find_user_id_by_phone: () => ({ data: lookupId, error: null }),
    create_wallet: (params) => ({ data: `wallet-de-${String(params.p_owner_id)}`, error: null }),
    post_ledger_transfer: post,
  };
}

describe("createTransferService", () => {
  it("404 quando o destinatário não existe", async () => {
    const service = createTransferService(
      fakeClient(baseHandlers(() => ({ data: [], error: null }), null)),
      "XOF",
    );
    await expect(service.createTransfer(baseInput())).rejects.toMatchObject({
      code: "recipient_not_found",
      httpStatus: 404,
    });
  });

  it("400 ao transferir para si próprio", async () => {
    const service = createTransferService(
      fakeClient(baseHandlers(() => ({ data: [], error: null }), SENDER)),
      "XOF",
    );
    await expect(service.createTransfer(baseInput())).rejects.toMatchObject({
      code: "cannot_transfer_to_self",
      httpStatus: 400,
    });
  });

  it("mapeia NJ004 para insufficient_funds (422)", async () => {
    const service = createTransferService(
      fakeClient(
        baseHandlers(() => ({ data: null, error: { code: "NJ004", message: "saldo insuficiente" } })),
      ),
      "XOF",
    );
    const err = await service.createTransfer(baseInput()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransferError);
    expect(err).toMatchObject({ code: "insufficient_funds", httpStatus: 422 });
  });

  it("mapeia NJ003 para idempotency_conflict (409)", async () => {
    const service = createTransferService(
      fakeClient(
        baseHandlers(() => ({ data: null, error: { code: "NJ003", message: "conflito" } })),
      ),
      "XOF",
    );
    await expect(service.createTransfer(baseInput())).rejects.toMatchObject({
      code: "idempotency_conflict",
      httpStatus: 409,
    });
  });

  it("devolve o resultado e envia os parâmetros corretos ao ledger", async () => {
    let captured: Record<string, unknown> = {};
    const service = createTransferService(
      fakeClient(
        baseHandlers((params) => {
          captured = params;
          return {
            data: [{ out_transaction_id: "77777777-7777-4777-8777-777777777777", out_replayed: false }],
            error: null,
          };
        }),
      ),
      "XOF",
    );
    const result = await service.createTransfer(baseInput());
    expect(result).toEqual({
      transactionId: "77777777-7777-4777-8777-777777777777",
      replayed: false,
      amount: 1000,
      currency: "XOF",
      toPhone: "+245955000002",
    });
    expect(captured.p_from_account).toBe(`wallet-de-${SENDER}`);
    expect(captured.p_to_account).toBe(`wallet-de-${RECIPIENT}`);
    expect(captured.p_type).toBe("transfer");
    expect(captured.p_initiator).toBe(SENDER);
  });
});
