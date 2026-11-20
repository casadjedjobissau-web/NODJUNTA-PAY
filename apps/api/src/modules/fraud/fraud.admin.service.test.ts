import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createFraudAdminService } from "./fraud.admin.service.js";

const ADMIN = "aaaaaaaa-0000-4000-8000-00000000000b";
const USER = "11111111-1111-4111-8111-111111111111";
const ALERT = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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

function failing(code: string): RpcResult {
  return { data: null, error: { code, message: "x" } };
}

const ROW = {
  id: ALERT,
  seq: 12,
  user_id: USER,
  full_name: "Ana Gomes",
  phone_masked: "+245 955 *** 801",
  rule: "velocity",
  decision: "block",
  operation: "transfer",
  amount: 1000,
  details: { count: 3, max: 3, window_minutes: 10 },
  status: "open",
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  created_at: "2026-11-14T10:00:00.000Z",
};

describe("createFraudAdminService: lista", () => {
  it("converte as linhas em alertas", async () => {
    const { client } = makeClient({ data: [ROW], error: null });

    const items = await createFraudAdminService(client).list("open", 20);

    expect(items).toEqual([
      {
        id: ALERT,
        seq: 12,
        userId: USER,
        fullName: "Ana Gomes",
        phoneMasked: "+245 955 *** 801",
        rule: "velocity",
        decision: "block",
        operation: "transfer",
        amount: 1000,
        details: { count: 3, max: 3, window_minutes: 10 },
        status: "open",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: "2026-11-14T10:00:00.000Z",
      },
    ]);
  });

  it("envia o estado e o limite à função SQL", async () => {
    const { client, calls } = makeClient({ data: [], error: null });

    await createFraudAdminService(client).list("reviewed", 20);

    expect(calls).toEqual([{ fn: "admin_list_fraud_alerts", params: { p_status: "reviewed", p_limit: 20 } }]);
  });

  it("sem filtro envia o estado nulo", async () => {
    const { client, calls } = makeClient({ data: [], error: null });

    expect(await createFraudAdminService(client).list(null, 50)).toEqual([]);
    expect(calls[0]?.params).toEqual({ p_status: null, p_limit: 50 });
  });

  it("valores desconhecidos voltam a valores seguros: decisão flag e estado open", async () => {
    const { client } = makeClient({
      data: [{ ...ROW, decision: "estranha", status: "estranho", full_name: null, phone_masked: null }],
      error: null,
    });

    const [item] = await createFraudAdminService(client).list(null, 10);

    expect(item).toMatchObject({ decision: "flag", status: "open", fullName: null, phoneMasked: null });
  });

  it("detalhes que não são um objeto viram um objeto vazio", async () => {
    for (const details of ["texto", [1, 2], null]) {
      const { client } = makeClient({ data: [{ ...ROW, details }], error: null });
      const [item] = await createFraudAdminService(client).list(null, 10);
      expect(item?.details).toEqual({});
    }
  });

  it("aceita o valor que chega como texto", async () => {
    const { client } = makeClient({ data: [{ ...ROW, amount: "600000" }], error: null });

    const [item] = await createFraudAdminService(client).list(null, 10);

    expect(item?.amount).toBe(600000);
  });

  it("erros inesperados sobem com o prefixo da operação", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "em baixo" } });

    await expect(createFraudAdminService(client).list(null, 10)).rejects.toThrow("Falha na gestão de alertas");
  });
});

describe("createFraudAdminService: tratar um alerta", () => {
  it("devolve reviewed e envia os parâmetros à função SQL", async () => {
    const { client, calls } = makeClient({ data: "reviewed", error: null });

    expect(await createFraudAdminService(client).review(ADMIN, ALERT, "Cliente contactado.")).toBe("reviewed");
    expect(calls).toEqual([
      {
        fn: "admin_review_fraud_alert",
        params: { p_admin: ADMIN, p_alert: ALERT, p_note: "Cliente contactado." },
      },
    ]);
  });

  it("sem nota envia a nota nula", async () => {
    const { client, calls } = makeClient({ data: "reviewed", error: null });

    await createFraudAdminService(client).review(ADMIN, ALERT, null);

    expect(calls[0]?.params).toEqual({ p_admin: ADMIN, p_alert: ALERT, p_note: null });
  });

  it("NJ034 vira alert_not_found (404)", async () => {
    const { client } = makeClient(failing("NJ034"));

    await expect(createFraudAdminService(client).review(ADMIN, ALERT, null)).rejects.toMatchObject({
      code: "alert_not_found",
      httpStatus: 404,
    });
  });

  it("NJ017 vira not_allowed_on_self (403)", async () => {
    const { client } = makeClient(failing("NJ017"));

    await expect(createFraudAdminService(client).review(ADMIN, ALERT, null)).rejects.toMatchObject({
      code: "not_allowed_on_self",
      httpStatus: 403,
    });
  });

  it("NJ001 vira invalid_request (400)", async () => {
    const { client } = makeClient(failing("NJ001"));

    await expect(createFraudAdminService(client).review(ADMIN, ALERT, null)).rejects.toMatchObject({
      code: "invalid_request",
      httpStatus: 400,
    });
  });

  it("falha com uma resposta inesperada", async () => {
    const { client } = makeClient({ data: "open", error: null });

    await expect(createFraudAdminService(client).review(ADMIN, ALERT, null)).rejects.toThrow(
      "Resposta inesperada",
    );
  });

  it("erros inesperados sobem com o prefixo da operação", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "em baixo" } });

    await expect(createFraudAdminService(client).review(ADMIN, ALERT, null)).rejects.toThrow(
      "Falha na gestão de alertas",
    );
  });
});
