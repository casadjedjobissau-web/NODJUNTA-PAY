import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FRAUD_RULES,
  type FraudBlockRule,
  type FraudDecision,
  type FraudOperation,
  type FraudRule,
  type FraudService,
} from "./fraud.types.js";

function asRule(value: unknown): FraudRule | null {
  return FRAUD_RULES.find((rule) => rule === value) ?? null;
}

function asBlockRule(value: unknown): FraudBlockRule | null {
  return value === "velocity" || value === "cooldown" ? value : null;
}

export function createFraudService(client: SupabaseClient): FraudService {
  async function check(userId: string, operation: FraudOperation, amount: number): Promise<FraudDecision> {
    const { data, error } = await client.rpc("fraud_check", {
      p_user: userId,
      p_operation: operation,
      p_amount: amount,
    });
    if (error) {
      throw new Error(`Falha na verificação antifraude: ${error.message}`);
    }

    const raw = Array.isArray(data) ? data[0] : data;
    const row = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!row) {
      throw new Error("Resposta inesperada de fraud_check");
    }

    if (row.out_decision === "allow") {
      return { decision: "allow" };
    }
    if (row.out_decision === "flag") {
      const rule = asRule(row.out_rule);
      if (rule) {
        return { decision: "flag", rule };
      }
    }
    if (row.out_decision === "block") {
      const rule = asBlockRule(row.out_rule);
      if (rule) {
        return { decision: "block", rule };
      }
    }
    throw new Error("Resposta inesperada de fraud_check");
  }

  return { check };
}
