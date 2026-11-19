export const FRAUD_OPERATIONS = ["transfer", "merchant_payment", "withdrawal"] as const;

export type FraudOperation = (typeof FRAUD_OPERATIONS)[number];

export const FRAUD_RULES = ["velocity", "cooldown", "large_amount"] as const;

export type FraudRule = (typeof FRAUD_RULES)[number];

export type FraudBlockRule = "velocity" | "cooldown";

export type FraudDecision =
  | { decision: "allow" }
  | { decision: "flag"; rule: FraudRule }
  | { decision: "block"; rule: FraudBlockRule };

export interface FraudService {
  check(userId: string, operation: FraudOperation, amount: number): Promise<FraudDecision>;
}

export interface FraudBlockResponse {
  httpStatus: number;
  error: string;
  message: string;
}

export function describeFraudBlock(rule: FraudBlockRule): FraudBlockResponse {
  if (rule === "velocity") {
    return {
      httpStatus: 429,
      error: "too_many_operations",
      message: "Fez demasiadas operações em pouco tempo. Aguarde alguns minutos e tente novamente.",
    };
  }
  return {
    httpStatus: 403,
    error: "withdrawal_cooldown",
    message:
      "Por segurança, os levantamentos ficam temporariamente bloqueados depois de alterar o PIN ou o número de telefone. Tente novamente mais tarde.",
  };
}

export const FRAUD_ALERT_STATUSES = ["open", "reviewed"] as const;

export type FraudAlertStatus = (typeof FRAUD_ALERT_STATUSES)[number];

export interface FraudAlertItem {
  id: string;
  seq: number;
  userId: string;
  fullName: string | null;
  phoneMasked: string | null;
  rule: string;
  decision: "block" | "flag";
  operation: string;
  amount: number;
  details: Record<string, unknown>;
  status: FraudAlertStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface FraudAdminService {
  list(status: FraudAlertStatus | null, limit: number): Promise<FraudAlertItem[]>;
  review(adminId: string, alertId: string, note: string | null): Promise<"reviewed">;
}

export class FraudError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "FraudError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
