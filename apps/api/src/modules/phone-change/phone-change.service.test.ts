import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createPhoneChangeService } from "./phone-change.service.js";

const ADMIN = "aaaaaaaa-0000-4000-8000-00000000000b";
const USER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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
  id: REQUEST,
  seq: 3,
  user_id: USER,
  full_name: "Ana Gomes",
  old_phone_masked: "+245 955 *** 701",
  new_phone: "+245955000799",
  reason: "Perdeu o cartão SIM",
  evidence_note: "Identidade verificada em videochamada de 14/11.",
  status: "pending",
  created_by: ADMIN,
  decided_by: null,
  decision_reason: null,
  created_at: "2026-11-14T10:00:00.000Z",
  decided_at: null,
};

const INPUT = {
  userId: USER,
  newPhone: "+245955000799",
  reason: "Perdeu o cartão SIM",
  evidence: "Identidade verificada em videochamada de 14/11.",
};

describe("createPhoneChangeService: lista", () => {
  it("converte as linhas em pedidos", async () => {
    const { client } = makeClient({ data: [ROW], error: null });

    const items = await createPhoneChangeService(client).list("pending", 20);

    expect(items).toEqual([
      {
        id: REQUEST,
        seq: 3,
        userId: USER,
        fullName: "Ana Gomes",
        oldPhoneMasked: "+245 955 *** 701",
        newPhone: "+245955000799",
        reason: "Perdeu o cartão SIM",
        evidenceNote: "Identidade verificada em videochamada de 14/11.",
        status: "pending",
        createdBy: ADMIN,
        decidedBy: null,
        decisionReason: null,
        createdAt: "2026-11-14T10:00:00.000Z",
        decidedAt: null,
      },
    ]);
  });

  it("envia o estado e o limite à função SQL", async () => {
    const { client, calls } = makeClient({ data: [], error: null });

    await createPhoneChangeService(client).list("approved", 20);

    expect(calls).toEqual([{ fn: "admin_list_phone_changes", params: { p_status: "approved", p_limit: 20 } }]);
  });

  it("sem filtro envia o estado nulo", async () => {
    const { client, calls } = makeClient({ data: [], error: null });

    expect(await createPhoneChangeService(client).list(null, 50)).toEqual([]);
    expect(calls[0]?.params).toEqual({ p_status: null, p_limit: 50 });
  });

  it("um estado desconhecido volta a 'pending' e os campos em falta ficam nulos ou vazios", async () => {
    const { client } = makeClient({
      data: [{ ...ROW, status: "estranho", full_name: null, old_phone_masked: null, decided_by: null }],
      error: null,
    });

    const [item] = await createPhoneChangeService(client).list(null, 10);

    expect(item).toMatchObject({ status: "pending", fullName: null, oldPhoneMasked: null, decidedBy: null });
  });

  it("erros inesperados sobem com o prefixo da operação", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "em baixo" } });

    await expect(createPhoneChangeService(client).list(null, 10)).rejects.toThrow("Falha na troca de número");
  });
});

describe("createPhoneChangeService: criar", () => {
  it("devolve o identificador e envia os parâmetros à função SQL", async () => {
    const { client, calls } = makeClient({ data: REQUEST, error: null });

    expect(await createPhoneChangeService(client).create(ADMIN, INPUT)).toEqual({ id: REQUEST });
    expect(calls).toEqual([
      {
        fn: "admin_phone_change_create",
        params: {
          p_admin: ADMIN,
          p_user: USER,
          p_new_phone: "+245955000799",
          p_reason: "Perdeu o cartão SIM",
          p_evidence: "Identidade verificada em videochamada de 14/11.",
        },
      },
    ]);
  });

  it("NJ030 vira phone_unavailable (409)", async () => {
    const { client } = makeClient(failing("NJ030"));

    await expect(createPhoneChangeService(client).create(ADMIN, INPUT)).rejects.toMatchObject({
      code: "phone_unavailable",
      httpStatus: 409,
    });
  });

  it("NJ032 vira invalid_state (409)", async () => {
    const { client } = makeClient(failing("NJ032"));

    await expect(createPhoneChangeService(client).create(ADMIN, INPUT)).rejects.toMatchObject({
      code: "invalid_state",
      httpStatus: 409,
    });
  });

  it("NJ033 vira user_ineligible (422)", async () => {
    const { client } = makeClient(failing("NJ033"));

    await expect(createPhoneChangeService(client).create(ADMIN, INPUT)).rejects.toMatchObject({
      code: "user_ineligible",
      httpStatus: 422,
    });
  });

  it("NJ017 vira same_person_not_allowed (403)", async () => {
    const { client } = makeClient(failing("NJ017"));

    await expect(createPhoneChangeService(client).create(ADMIN, INPUT)).rejects.toMatchObject({
      code: "same_person_not_allowed",
      httpStatus: 403,
    });
  });

  it("NJ001 vira invalid_request (400)", async () => {
    const { client } = makeClient(failing("NJ001"));

    await expect(createPhoneChangeService(client).create(ADMIN, INPUT)).rejects.toMatchObject({
      code: "invalid_request",
      httpStatus: 400,
    });
  });

  it("falha com uma resposta inesperada", async () => {
    const { client } = makeClient({ data: 123, error: null });

    await expect(createPhoneChangeService(client).create(ADMIN, INPUT)).rejects.toThrow("Resposta inesperada");
  });
});

describe("createPhoneChangeService: decidir", () => {
  it("devolve o estado final e envia os parâmetros, na aprovação e na recusa", async () => {
    const approved = makeClient({ data: "approved", error: null });
    expect(await createPhoneChangeService(approved.client).decide(ADMIN, REQUEST, true, null)).toBe("approved");
    expect(approved.calls).toEqual([
      {
        fn: "admin_phone_change_decide",
        params: { p_admin: ADMIN, p_request: REQUEST, p_approve: true, p_reason: null },
      },
    ]);

    const rejected = makeClient({ data: "rejected", error: null });
    expect(
      await createPhoneChangeService(rejected.client).decide(ADMIN, REQUEST, false, "Identidade não confirmada."),
    ).toBe("rejected");
    expect(rejected.calls[0]?.params).toEqual({
      p_admin: ADMIN,
      p_request: REQUEST,
      p_approve: false,
      p_reason: "Identidade não confirmada.",
    });
  });

  it("NJ031 vira request_not_found (404)", async () => {
    const { client } = makeClient(failing("NJ031"));

    await expect(createPhoneChangeService(client).decide(ADMIN, REQUEST, true, null)).rejects.toMatchObject({
      code: "request_not_found",
      httpStatus: 404,
    });
  });

  it("NJ030 ao aprovar vira phone_unavailable (409)", async () => {
    const { client } = makeClient(failing("NJ030"));

    await expect(createPhoneChangeService(client).decide(ADMIN, REQUEST, true, null)).rejects.toMatchObject({
      code: "phone_unavailable",
      httpStatus: 409,
    });
  });

  it("NJ017 vira same_person_not_allowed (403)", async () => {
    const { client } = makeClient(failing("NJ017"));

    await expect(createPhoneChangeService(client).decide(ADMIN, REQUEST, true, null)).rejects.toMatchObject({
      code: "same_person_not_allowed",
      httpStatus: 403,
    });
  });

  it("NJ032 vira invalid_state (409)", async () => {
    const { client } = makeClient(failing("NJ032"));

    await expect(createPhoneChangeService(client).decide(ADMIN, REQUEST, true, null)).rejects.toMatchObject({
      code: "invalid_state",
      httpStatus: 409,
    });
  });

  it("falha com uma resposta inesperada", async () => {
    const { client } = makeClient({ data: "pending", error: null });

    await expect(createPhoneChangeService(client).decide(ADMIN, REQUEST, true, null)).rejects.toThrow(
      "Resposta inesperada",
    );
  });

  it("erros inesperados sobem com o prefixo da operação", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "em baixo" } });

    await expect(createPhoneChangeService(client).decide(ADMIN, REQUEST, true, null)).rejects.toThrow(
      "Falha na troca de número",
    );
  });
});
