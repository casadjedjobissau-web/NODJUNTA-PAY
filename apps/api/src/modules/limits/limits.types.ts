export type LimitOperation = "transfer" | "merchant_payment" | "withdrawal";

export interface PeriodUsage {
  limit: number;
  used: number;
  remaining: number;
}

export interface FeeView {
  flatAmount: number;
  bps: number;
  minFee: number;
  maxFee: number | null;
}

export interface OperationLimits {
  operation: LimitOperation;
  allowed: boolean;
  perTransaction: number | null;
  day: PeriodUsage | null;
  month: PeriodUsage | null;
  fee: FeeView;
}

export interface LimitsView {
  kycLevel: number;
  currency: string;
  operations: OperationLimits[];
}

export interface LimitsService {
  getLimits(userId: string): Promise<LimitsView>;
}
