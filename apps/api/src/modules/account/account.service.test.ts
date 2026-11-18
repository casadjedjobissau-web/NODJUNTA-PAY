import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createAccountService } from "./account.service.js";

const USER = "11111111-1111-4111-8111-111111111111";

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

function rowsOf(...names: string[]) {
  return names.map((name) => ({ out_blocker: name }));
}

describe("createAccountService: verificação", () => {
  it("sem bloqueios, a conta pode ser eliminada", async () => {
    const { client } = makeClient({ data: [], error: null });

    expect(await createAccountService(client).checkDeletion(USER)).toEqual({
      canDelete: true,
      alreadyDeleted: false,
      blockers: [],
    });
  });

  it("devolve os bloqueios sempre pela mesma ordem, seja qual for a ordem da resposta", async () => {
    const { client } = makeClient({
      data: rowsOf("admin", "frozen", "balance", "pending_requests"),
      error: null,
    });

    const check = await createAccountService(client).checkDeletion(USER);

    expect(check.canDelete).toBe(false);
    expect(check.alreadyDeleted).toBe(false);
    expect(check.blockers).toEqual(["balance", "pending_requests", "frozen", "admin"]);
  });

  it("uma conta já eliminada não pode ser eliminada outra vez", async () => {
    const { client } = makeClient({ data: rowsOf("already_deleted"), error: null });

    expect(await createAccountService(client).checkDeletion(USER)).toEqual({
      canDelete: false,
      alreadyDeleted: true,
      blockers: [],
    });
  });

  it("envia o utilizador à função SQL", async () => {
    const { client, calls } = makeClient({ data: [], error: null });

    await createAccountService(client).checkDeletion(USER);

    expect(calls).toEqual([{ fn: "account_deletion_blockers", params: { p_user: USER } }]);
  });

  it("ignora bloqueios que não conhece", async () => {
    const { client } = makeClient({ data: rowsOf("xpto", "balance"), error: null });

    const check = await createAccountService(client).checkDeletion(USER);

    expect(check.blockers).toEqual(["balance"]);
    expect(check.canDelete).toBe(false);
  });

  it("uma resposta sem lista conta como sem bloqueios", async () => {
    const { client } = makeClient({ data: null, error: null });

    const check = await createAccountService(client).checkDeletion(USER);

    expect(check.canDelete).toBe(true);
    expect(check.blockers).toEqual([]);
  });

  it("NJ001 vira invalid_request (400)", async () => {
    const { client } = makeClient({ data: null, error: { code: "NJ001", message: "x" } });

    await expect(createAccountService(client).checkDeletion(USER)).rejects.toMatchObject({
      code: "invalid_request",
      httpStatus: 400,
    });
  });

  it("erros inesperados sobem como erros genéricos", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "base de dados em baixo" } });

    await expect(createAccountService(client).checkDeletion(USER)).rejects.toThrow("base de dados em baixo");
  });
});

describe("createAccountService: eliminação", () => {
  it("devolve deleted e envia o utilizador à função SQL", async () => {
    const { client, calls } = makeClient({ data: "deleted", error: null });

    expect(await createAccountService(client).deleteAccount(USER)).toBe("deleted");
    expect(calls).toEqual([{ fn: "delete_account", params: { p_user: USER } }]);
  });

  it("devolve already_deleted quando já estava eliminada", async () => {
    const { client } = makeClient({ data: "already_deleted", error: null });

    expect(await createAccountService(client).deleteAccount(USER)).toBe("already_deleted");
  });

  it("NJ026 vira balance_not_zero (409)", async () => {
    const { client } = makeClient({ data: null, error: { code: "NJ026", message: "x" } });

    const error = await createAccountService(client)
      .deleteAccount(USER)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "balance_not_zero", httpStatus: 409 });
    expect((error as Error).message).toContain("saldo");
  });

  it("NJ027 vira pending_requests (409)", async () => {
    const { client } = makeClient({ data: null, error: { code: "NJ027", message: "x" } });

    await expect(createAccountService(client).deleteAccount(USER)).rejects.toMatchObject({
      code: "pending_requests",
      httpStatus: 409,
    });
  });

  it("NJ028 vira account_frozen (403)", async () => {
    const { client } = makeClient({ data: null, error: { code: "NJ028", message: "x" } });

    await expect(createAccountService(client).deleteAccount(USER)).rejects.toMatchObject({
      code: "account_frozen",
      httpStatus: 403,
    });
  });

  it("NJ029 vira admin_account (403)", async () => {
    const { client } = makeClient({ data: null, error: { code: "NJ029", message: "x" } });

    await expect(createAccountService(client).deleteAccount(USER)).rejects.toMatchObject({
      code: "admin_account",
      httpStatus: 403,
    });
  });

  it("falha com uma resposta inesperada", async () => {
    const { client } = makeClient({ data: "talvez", error: null });

    await expect(createAccountService(client).deleteAccount(USER)).rejects.toThrow("Resposta inesperada");
  });

  it("erros inesperados sobem com o prefixo da operação", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "em baixo" } });

    await expect(createAccountService(client).deleteAccount(USER)).rejects.toThrow(
      "Falha na eliminação de conta",
    );
  });
});
