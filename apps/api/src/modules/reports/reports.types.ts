export interface DailyTotals {
  transfersCount: number;
  transfersVolume: number;
  paymentsCount: number;
  paymentsVolume: number;
  depositsCount: number;
  depositsVolume: number;
  withdrawalsCount: number;
  withdrawalsVolume: number;
  feesNet: number;
  newUsers: number;
}

export interface DailyReportRow extends DailyTotals {
  day: string;
}

export interface DailyReport {
  currency: string;
  from: string;
  to: string;
  rows: DailyReportRow[];
  totals: DailyTotals;
}

export interface ReportSummary {
  currency: string;
  userWallets: number;
  userBalance: number;
  merchantWallets: number;
  merchantBalance: number;
  feeBalance: number;
  settlementBalance: number;
  suspenseBalance: number;
  pendingDepositsCount: number;
  pendingDepositsAmount: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmount: number;
  ledgerGap: number;
}

export interface MerchantReportRow {
  merchantCode: string;
  businessName: string;
  paymentsCount: number;
  paymentsVolume: number;
}

export interface ReportService {
  summary(): Promise<ReportSummary>;
  daily(from: string, to: string): Promise<DailyReport>;
  merchants(from: string, to: string, limit: number): Promise<MerchantReportRow[]>;
  exportDailyCsv(adminId: string, from: string, to: string, ip: string | null): Promise<string>;
}

export class ReportError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "ReportError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
