import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FeeView,
  LimitOperation,
  LimitsService,
  LimitsView,
  OperationLimits,
  PeriodUsage,
} from "./limits.types.js";

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

const OPERATIONS: LimitOperation[] = ["transfer", "merchant_payment", "withdrawal"];

const NO_FEE: FeeView = { flatAmount: 0, bps: 0, minFee: 0, maxFee: null };

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function usage(limit: number, used: number): PeriodUsage {
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export function createLimitsService(
  client: SupabaseClient,
  currency: string,
  now: () => Date = () => new Date(),
): LimitsService {
  async function readUsed(userId: string, operation: LimitOperation, from: Date): Promise<number> {
    const { data, error } = await client.rpc("used_amount", {
      p_user_id: userId,
      p_operation: operation,
      p_from: from.toISOString(),
    });
    if (error) {
      throw new Error(`Falha ao calcular consumo: ${error.message}`);
    }
    return Number(data ?? 0);
  }

  async function getLimits(userId: string): Promise<LimitsView> {
    const profile = await client
      .from("profiles")
      .select("kyc_level")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile.error) {
      throw new Error(`Falha ao ler perfil: ${profile.error.message}`);
    }
    const kycLevel = profile.data ? Number((profile.data as { kyc_level: number }).kyc_level) : 0;

    const rules = await client
      .from("limit_rules")
      .select("operation, period, max_amount")
      .eq("kyc_level", kycLevel);
    if (rules.error) {
      throw new Error(`Falha ao ler limites: ${rules.error.message}`);
    }

    const fees = await client
      .from("fee_rules")
      .select("operation, flat_amount, bps, min_fee, max_fee");
    if (fees.error) {
      throw new Error(`Falha ao ler tarifas: ${fees.error.message}`);
    }

    const ruleRows = (rules.data ?? []) as RuleRow[];
    const feeRows = (fees.data ?? []) as FeeRow[];
    const current = now();
    const dayStart = startOfUtcDay(current);
    const monthStart = startOfUtcMonth(current);

    const operations: OperationLimits[] = [];
    for (const operation of OPERATIONS) {
      const opRules = ruleRows.filter((r) => r.operation === operation);
      const perTx = opRules.find((r) => r.period === "tx");
      const dayRule = opRules.find((r) => r.period === "day");
      const monthRule = opRules.find((r) => r.period === "month");
      const feeRow = feeRows.find((f) => f.operation === operation);

      const fee: FeeView = feeRow
        ? {
            flatAmount: Number(feeRow.flat_amount),
            bps: Number(feeRow.bps),
            minFee: Number(feeRow.min_fee),
            maxFee: feeRow.max_fee === null ? null : Number(feeRow.max_fee),
          }
        : NO_FEE;

      const day = dayRule
        ? usage(Number(dayRule.max_amount), await readUsed(userId, operation, dayStart))
        : null;
      const month = monthRule
        ? usage(Number(monthRule.max_amount), await readUsed(userId, operation, monthStart))
        : null;

      operations.push({
        operation,
        allowed: opRules.length > 0,
        perTransaction: perTx ? Number(perTx.max_amount) : null,
        day,
        month,
        fee,
      });
    }

    return { kycLevel, currency, operations };
  }

  return { getLimits };
}
