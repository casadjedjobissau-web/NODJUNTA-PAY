import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { KYC_BUCKET } from "../kyc/kyc.service.js";
import { parseRetentionDays, purgeKycDocuments } from "./kyc-purge.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

interface Setup {
  candidates?: unknown[];
  candidatesError?: { message: string } | null;
  submissions?: Record<string, string[]>;
  submissionsFail?: Set<string>;
  removeFail?: Set<string>;
  markFail?: Set<string>;
  existing?: Set<string>;
}

function makeClient(setup: Setup) {
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const removeCalls: string[][] = [];
  const buckets: string[] = [];

  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      if (fn === "kyc_purge_candidates") {
        return { data: setup.candidates ?? [], error: setup.candidatesError ?? null };
      }
      if (fn === "kyc_mark_purged") {
        const failed = setup.markFail?.has(String(params.p_user)) ?? false;
        return { data: null, error: failed ? { message: "falha" } : null };
      }
      throw new Error(`rpc inesperado: ${fn}`);
    },
    from: (table: string) => {
      if (table !== "kyc_submissions") {
        throw new Error(`tabela inesperada: ${table}`);
      }
      let userId = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = (_column: string, value: unknown) => {
        userId = String(value);
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const failed = setup.submissionsFail?.has(userId) ?? false;
        const result = failed
          ? { data: null, error: { message: "falha" } }
          : { data: (setup.submissions?.[userId] ?? []).map((id) => ({ id })), error: null };
        return Promise.resolve(result).then(resolve, reject);
      };
      return builder;
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          buckets.push(bucket);
          removeCalls.push(paths);
          const owner = paths[0]?.split("/")[0] ?? "";
          if (setup.removeFail?.has(owner)) {
            return { data: null, error: { message: "falha" } };
          }
          const present = setup.existing ? paths.filter((path) => setup.existing?.has(path)) : paths;
          return { data: present.map((name) => ({ name })), error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  return { client, rpcCalls, removeCalls, buckets };
}

function candidateRows(...ids: string[]) {
  return ids.map((id) => ({ out_user_id: id }));
}

function markedUsers(calls: Array<{ fn: string; params: Record<string, unknown> }>): string[] {
  return calls.filter((call) => call.fn === "kyc_mark_purged").map((call) => String(call.params.p_user));
}

describe("parseRetentionDays", () => {
  it("aceita inteiros com 1 a 5 dígitos", () => {
    expect(parseRetentionDays("0")).toBe(0);
    expect(parseRetentionDays("90")).toBe(90);
    expect(parseRetentionDays("1825")).toBe(1825);
    expect(parseRetentionDays("99999")).toBe(99999);
  });

  it("recusa tudo o resto", () => {
    for (const value of [undefined, "", "abc", "-1", "1.5", "1,5", " 90", "90 ", "100000", "9e2"]) {
      expect(parseRetentionDays(value)).toBeNull();
    }
  });
});

describe("purgeKycDocuments", () => {
  it("envia os dias e o limite por omissão (100) à função SQL", async () => {
    const { client, rpcCalls } = makeClient({ candidates: [] });

    await purgeKycDocuments(client, 90);

    expect(rpcCalls).toEqual([
      { fn: "kyc_purge_candidates", params: { p_older_than_days: 90, p_limit: 100 } },
    ]);
  });

  it("respeita um limite personalizado", async () => {
    const { client, rpcCalls } = makeClient({ candidates: [] });

    await purgeKycDocuments(client, 30, 25);

    expect(rpcCalls[0]?.params).toEqual({ p_older_than_days: 30, p_limit: 25 });
  });

  it("sem candidatos, não faz mais nada", async () => {
    const { client, removeCalls, rpcCalls } = makeClient({ candidates: [] });

    expect(await purgeKycDocuments(client, 90)).toEqual({ users: 0, files: 0, failed: 0 });
    expect(removeCalls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(1);
  });

  it("apaga a frente, o verso e a selfie de cada pedido e marca a conta como limpa", async () => {
    const { client, removeCalls, buckets, rpcCalls } = makeClient({
      candidates: candidateRows(U1),
      submissions: { [U1]: ["s1"] },
    });

    const result = await purgeKycDocuments(client, 90);

    expect(result).toEqual({ users: 1, files: 3, failed: 0 });
    expect(buckets).toEqual([KYC_BUCKET]);
    expect(removeCalls).toEqual([[`${U1}/s1/front`, `${U1}/s1/back`, `${U1}/s1/selfie`]]);
    expect(markedUsers(rpcCalls)).toEqual([U1]);
  });

  it("apaga os ficheiros de todos os pedidos da conta numa só chamada", async () => {
    const { client, removeCalls } = makeClient({
      candidates: candidateRows(U1),
      submissions: { [U1]: ["s1", "s2"] },
    });

    const result = await purgeKycDocuments(client, 90);

    expect(result.files).toBe(6);
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]).toEqual([
      `${U1}/s1/front`,
      `${U1}/s1/back`,
      `${U1}/s1/selfie`,
      `${U1}/s2/front`,
      `${U1}/s2/back`,
      `${U1}/s2/selfie`,
    ]);
  });

  it("conta só os ficheiros que existiam", async () => {
    const { client } = makeClient({
      candidates: candidateRows(U1),
      submissions: { [U1]: ["s1"] },
      existing: new Set([`${U1}/s1/front`, `${U1}/s1/selfie`]),
    });

    expect(await purgeKycDocuments(client, 90)).toEqual({ users: 1, files: 2, failed: 0 });
  });

  it("uma conta sem pedidos de KYC é marcada como limpa sem apagar nada", async () => {
    const { client, removeCalls, rpcCalls } = makeClient({ candidates: candidateRows(U1) });

    expect(await purgeKycDocuments(client, 90)).toEqual({ users: 1, files: 0, failed: 0 });
    expect(removeCalls).toHaveLength(0);
    expect(markedUsers(rpcCalls)).toEqual([U1]);
  });

  it("se apagar os ficheiros falhar, não marca a conta e continua com as outras", async () => {
    const { client, rpcCalls } = makeClient({
      candidates: candidateRows(U1, U2),
      submissions: { [U1]: ["s1"], [U2]: ["s2"] },
      removeFail: new Set([U1]),
    });

    const result = await purgeKycDocuments(client, 90);

    expect(result).toEqual({ users: 1, files: 3, failed: 1 });
    expect(markedUsers(rpcCalls)).toEqual([U2]);
  });

  it("se ler os pedidos falhar, não apaga nem marca essa conta", async () => {
    const { client, removeCalls, rpcCalls } = makeClient({
      candidates: candidateRows(U1),
      submissionsFail: new Set([U1]),
    });

    expect(await purgeKycDocuments(client, 90)).toEqual({ users: 0, files: 0, failed: 1 });
    expect(removeCalls).toHaveLength(0);
    expect(markedUsers(rpcCalls)).toEqual([]);
  });

  it("se marcar a conta como limpa falhar, não a conta como limpa", async () => {
    const { client } = makeClient({
      candidates: candidateRows(U1),
      submissions: { [U1]: ["s1"] },
      markFail: new Set([U1]),
    });

    const result = await purgeKycDocuments(client, 90);

    expect(result.users).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("se listar os candidatos falhar, lança o erro", async () => {
    const { client } = makeClient({ candidatesError: { message: "sem ligação" } });

    await expect(purgeKycDocuments(client, 90)).rejects.toThrow("Falha ao listar contas por limpar");
  });

  it("recusa um número de dias inválido sem falar com a base de dados", async () => {
    const { client, rpcCalls } = makeClient({ candidates: [] });

    await expect(purgeKycDocuments(client, -1)).rejects.toThrow("inteiro");
    await expect(purgeKycDocuments(client, 1.5)).rejects.toThrow("inteiro");
    expect(rpcCalls).toHaveLength(0);
  });

  it("ignora linhas da resposta sem identificador de utilizador", async () => {
    const { client } = makeClient({
      candidates: [{ out_user_id: null }, { outro: "x" }, { out_user_id: U1 }],
      submissions: { [U1]: ["s1"] },
    });

    expect(await purgeKycDocuments(client, 90)).toEqual({ users: 1, files: 3, failed: 0 });
  });
});
