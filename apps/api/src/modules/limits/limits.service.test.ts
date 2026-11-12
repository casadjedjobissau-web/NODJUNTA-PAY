import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createLimitsService } from "./limits.service.js";

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-12T15:30:00.000Z");
const DAY_START = "2026-11-12T00:00:00.000Z";
const MONTH_START = "2026-11-01T00:00:00.000Z";

interface RuleRow {
  operation: string;
  period: string;
  max_amount: number;
}

interface FeeRow {
  operation: string;
  flat_amount: number;
  bps: number;
  min_fee: number;
  max_fee: number | null;
}

interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

interface Options {
  kycLevel: number | null;
  rules: RuleRow[];
  fees?: FeeRow[];
  used?: (operation: string, from: string) => number;
}

function chain(result: { data: unknown; error: null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of ["select", "eq"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function makeClient(options: Options) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    from: (table: string) => {
      if (table === "profiles") {
        return chain({
          data: options.kycLevel === null ? null : { kyc_level: options.kycLevel },
          error: null,
        });
      }
      if (table === "limit_rules") {
        return chain({ data: options.rules, error: null });
      }
      if (table === "fee_rules") {
        return chain({ data: options.fees ?? [], error: null });
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      const used = options.used
        ? options.used(String(params.p_operation), String(params.p_from))
        : 0;
      return { data: used, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, rpcCalls };
}

function ruleSet(operation: string): RuleRow[] {
  return [
    { operation, period: "tx", max_amount: 25000 },
    { operation, period: "day", max_amount: 50000 },
    { operation, period: "month", max_amount: 200000 },
  ];
}

describe("createLimitsService", () => {
  it("nível 0 sem perfil: transferência permitida e levantamento não permitido", async () => {
    const { client } = makeClient({
      kycLevel: null,
      rules: [...ruleSet("transfer"), ...ruleSet("merchant_payment")],
    });
    const service = createLimitsService(client, "XOF", () => NOW);

    const view = await service.getLimits(USER);

    expect(view.kycLevel).toBe(0);
    expect(view.currency).toBe("XOF");
    const transfer = view.operations.find((op) => op.operation === "transfer");
    const withdrawal = view.operations.find((op) => op.operation === "withdrawal");
    expect(transfer).toMatchObject({ allowed: true, perTransaction: 25000 });
    expect(withdrawal).toMatchObject({
      allowed: false,
      perTransaction: null,
      day: null,
      month: null,
    });
  });

  it("calcula consumo e restante, com dia e mês em UTC", async () => {
    const { client, rpcCalls } = makeClient({
      kycLevel: 0,
      rules: ruleSet("transfer"),
      used: (operation, from) => {
        if (operation !== "transfer") {
          return 0;
        }
        return from === DAY_START ? 12000 : 30000;
      },
    });
    const service = createLimitsService(client, "XOF", () => NOW);

    const view = await service.getLimits(USER);
    const transfer = view.operations.find((op) => op.operation === "transfer");

    expect(transfer?.day).toEqual({ limit: 50000, used: 12000, remaining: 38000 });
    expect(transfer?.month).toEqual({ limit: 200000, used: 30000, remaining: 170000 });
    const froms = rpcCalls
      .filter((call) => call.params.p_operation === "transfer")
      .map((call) => call.params.p_from);
    expect(froms).toEqual([DAY_START, MONTH_START]);
  });

  it("o restante nunca fica negativo", async () => {
    const { client } = makeClient({
      kycLevel: 0,
      rules: ruleSet("transfer"),
      used: () => 60000,
    });
    const service = createLimitsService(client, "XOF", () => NOW);

    const view = await service.getLimits(USER);
    const transfer = view.operations.find((op) => op.operation === "transfer");

    expect(transfer?.day?.remaining).toBe(0);
    expect(transfer?.day?.used).toBe(60000);
  });

  it("devolve a tarifa configurada e zeros quando não há regra", async () => {
    const { client } = makeClient({
      kycLevel: 1,
      rules: ruleSet("transfer"),
      fees: [{ operation: "transfer", flat_amount: 100, bps: 100, min_fee: 0, max_fee: null }],
    });
    const service = createLimitsService(client, "XOF", () => NOW);

    const view = await service.getLimits(USER);
    const transfer = view.operations.find((op) => op.operation === "transfer");
    const payment = view.operations.find((op) => op.operation === "merchant_payment");

    expect(transfer?.fee).toEqual({ flatAmount: 100, bps: 100, minFee: 0, maxFee: null });
    expect(payment?.fee).toEqual({ flatAmount: 0, bps: 0, minFee: 0, maxFee: null });
  });

  it("não calcula consumo para operações sem regras", async () => {
    const { client, rpcCalls } = makeClient({
      kycLevel: 0,
      rules: ruleSet("transfer"),
    });
    const service = createLimitsService(client, "XOF", () => NOW);

    await service.getLimits(USER);

    expect(rpcCalls.filter((call) => call.params.p_operation === "withdrawal")).toHaveLength(0);
    expect(rpcCalls.filter((call) => call.params.p_operation === "merchant_payment")).toHaveLength(0);
  });
});
