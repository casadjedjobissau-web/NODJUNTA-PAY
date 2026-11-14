import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createReceiptService } from "./receipts.service.js";

const USER = "11111111-1111-4111-8111-111111111111";
const TX = "33333333-3333-4333-8333-333333333333";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

function makeClient(result: RpcResult) {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push({ fn, params });
      return result;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    receipt_number: "NP-261114-000123",
    transaction_id: TX,
    user_id: USER,
    direction: "out",
    kind: "transfer",
    amount: 4000,
    fee: 100,
    currency: "XOF",
    counterparty_label: "Bruno Sá",
    counterparty_detail: "+245 955 *** 302",
    reference: "almoço",
    occurred_at: "2026-11-14T10:00:00.000Z",
    created_at: "2026-11-14T10:00:05.000Z",
    ...overrides,
  };
}

describe("createReceiptService", () => {
  it("converte a linha num recibo, com o total debitado quando é uma saída", async () => {
    const { client } = makeClient({ data: [row()], error: null });

    const receipt = await createReceiptService(client).get(USER, TX);

    expect(receipt).toEqual({
      receiptNumber: "NP-261114-000123",
      transactionId: TX,
      kind: "transfer",
      direction: "out",
      amount: 4000,
      fee: 100,
      total: 4100,
      currency: "XOF",
      counterparty: { label: "Bruno Sá", detail: "+245 955 *** 302" },
      reference: "almoço",
      occurredAt: "2026-11-14T10:00:00.000Z",
      issuedAt: "2026-11-14T10:00:05.000Z",
    });
  });

  it("numa entrada o total é só o valor recebido", async () => {
    const { client } = makeClient({
      data: [row({ direction: "in", fee: 0, counterparty_label: "Ana Gomes", reference: null })],
      error: null,
    });

    const receipt = await createReceiptService(client).get(USER, TX);

    expect(receipt.direction).toBe("in");
    expect(receipt.total).toBe(4000);
    expect(receipt.reference).toBeNull();
  });

  it("aceita uma resposta que não vem numa lista e campos opcionais nulos", async () => {
    const { client } = makeClient({
      data: row({ counterparty_label: null, counterparty_detail: null, fee: null }),
      error: null,
    });

    const receipt = await createReceiptService(client).get(USER, TX);

    expect(receipt.counterparty).toEqual({ label: null, detail: null });
    expect(receipt.fee).toBe(0);
    expect(receipt.total).toBe(4000);
  });

  it("envia o utilizador e a transação à função SQL", async () => {
    const { client, calls } = makeClient({ data: [row()], error: null });

    await createReceiptService(client).get(USER, TX);

    expect(calls).toEqual([{ fn: "get_or_create_receipt", params: { p_user: USER, p_transaction: TX } }]);
  });

  it("NJ021 vira receipt_not_available (404)", async () => {
    const { client } = makeClient({ data: null, error: { code: "NJ021", message: "x" } });

    await expect(createReceiptService(client).get(USER, TX)).rejects.toMatchObject({
      code: "receipt_not_available",
      httpStatus: 404,
    });
  });

  it("NJ001 vira invalid_request (400)", async () => {
    const { client } = makeClient({ data: null, error: { code: "NJ001", message: "x" } });

    await expect(createReceiptService(client).get(USER, TX)).rejects.toMatchObject({
      code: "invalid_request",
      httpStatus: 400,
    });
  });

  it("outros erros sobem como erros genéricos", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "base de dados em baixo" } });

    await expect(createReceiptService(client).get(USER, TX)).rejects.toThrow("base de dados em baixo");
  });

  it("falha quando a resposta não traz nenhuma linha", async () => {
    const { client } = makeClient({ data: [], error: null });

    await expect(createReceiptService(client).get(USER, TX)).rejects.toThrow("Resposta inesperada");
  });

  it("falha com um tipo de recibo desconhecido", async () => {
    const { client } = makeClient({ data: [row({ kind: "algo_novo" })], error: null });

    await expect(createReceiptService(client).get(USER, TX)).rejects.toThrow("Tipo de recibo desconhecido");
  });

  it("falha com uma direção desconhecida", async () => {
    const { client } = makeClient({ data: [row({ direction: "lado" })], error: null });

    await expect(createReceiptService(client).get(USER, TX)).rejects.toThrow("Direção de recibo desconhecida");
  });
});
