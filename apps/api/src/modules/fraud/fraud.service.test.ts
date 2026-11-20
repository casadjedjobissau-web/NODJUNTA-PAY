import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createFraudService } from "./fraud.service.js";

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

function ok(decision: string, rule: string | null): RpcResult {
  return { data: [{ out_decision: decision, out_rule: rule }], error: null };
}

describe("createFraudService", () => {
  it("allow: a operação pode avançar", async () => {
    const { client } = makeClient(ok("allow", null));

    expect(await createFraudService(client).check(USER, "transfer", 1000)).toEqual({ decision: "allow" });
  });

  it("flag: passa, mas devolve a regra que sinalizou", async () => {
    const { client } = makeClient(ok("flag", "large_amount"));

    expect(await createFraudService(client).check(USER, "transfer", 600000)).toEqual({
      decision: "flag",
      rule: "large_amount",
    });
  });

  it("block por velocidade", async () => {
    const { client } = makeClient(ok("block", "velocity"));

    expect(await createFraudService(client).check(USER, "transfer", 1000)).toEqual({
      decision: "block",
      rule: "velocity",
    });
  });

  it("block por pausa nos levantamentos", async () => {
    const { client } = makeClient(ok("block", "cooldown"));

    expect(await createFraudService(client).check(USER, "withdrawal", 1000)).toEqual({
      decision: "block",
      rule: "cooldown",
    });
  });

  it("envia o utilizador, a operação e o valor à função SQL", async () => {
    const { client, calls } = makeClient(ok("allow", null));

    await createFraudService(client).check(USER, "withdrawal", 2500);

    expect(calls).toEqual([
      { fn: "fraud_check", params: { p_user: USER, p_operation: "withdrawal", p_amount: 2500 } },
    ]);
  });

  it("aceita uma resposta que não vem numa lista", async () => {
    const { client } = makeClient({ data: { out_decision: "allow", out_rule: null }, error: null });

    expect(await createFraudService(client).check(USER, "transfer", 1000)).toEqual({ decision: "allow" });
  });

  it("falha com uma regra desconhecida num flag", async () => {
    const { client } = makeClient(ok("flag", "regra_inventada"));

    await expect(createFraudService(client).check(USER, "transfer", 1000)).rejects.toThrow("Resposta inesperada");
  });

  it("falha com um flag sem regra", async () => {
    const { client } = makeClient(ok("flag", null));

    await expect(createFraudService(client).check(USER, "transfer", 1000)).rejects.toThrow("Resposta inesperada");
  });

  it("falha quando um bloqueio traz uma regra que só sinaliza (large_amount)", async () => {
    const { client } = makeClient(ok("block", "large_amount"));

    await expect(createFraudService(client).check(USER, "transfer", 1000)).rejects.toThrow("Resposta inesperada");
  });

  it("falha com uma decisão desconhecida, em vez de a tratar como allow", async () => {
    const { client } = makeClient(ok("talvez", null));

    await expect(createFraudService(client).check(USER, "transfer", 1000)).rejects.toThrow("Resposta inesperada");
  });

  it("falha com uma resposta vazia ou nula, em vez de a tratar como allow", async () => {
    for (const data of [[], null, undefined]) {
      const { client } = makeClient({ data, error: null });
      await expect(createFraudService(client).check(USER, "transfer", 1000)).rejects.toThrow("Resposta inesperada");
    }
  });

  it("um erro da base de dados sobe com o prefixo da verificação", async () => {
    const { client } = makeClient({ data: null, error: { code: "XX000", message: "base de dados em baixo" } });

    await expect(createFraudService(client).check(USER, "transfer", 1000)).rejects.toThrow(
      "Falha na verificação antifraude",
    );
  });
});
