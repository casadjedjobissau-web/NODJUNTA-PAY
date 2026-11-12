export interface WalletView {
  accountId: string;
  currency: string;
  balance: number;
  status: string;
}

export interface StatementEntry {
  id: number;
  transactionId: string;
  direction: "debit" | "credit";
  amount: number;
  balanceAfter: number;
  createdAt: string;
  type: string | null;
  reference: string | null;
}

export interface StatementPage {
  items: StatementEntry[];
  nextCursor: number | null;
}

export interface TransferResult {
  transactionId: string;
  replayed: boolean;
  amount: number;
  currency: string;
  toPhone: string;
}

export interface MerchantPreview {
  merchantCode: string;
  businessName: string;
}

export interface MerchantPaymentResult {
  transactionId: string;
  replayed: boolean;
  amount: number;
  currency: string;
  merchantCode: string;
  businessName: string;
}

export interface ProfileView {
  userId: string;
  fullName: string | null;
  language: "pt" | "kri";
  kycLevel: number;
}

export type FundingKind = "deposit" | "withdrawal";
export type FundingStatus = "pending" | "completed" | "failed";

export interface FundingRequestView {
  id: string;
  kind: FundingKind;
  status: FundingStatus;
  amount: number;
  currency: string;
  destination: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface FundingResult {
  request: FundingRequestView;
  replayed: boolean;
}

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

export type KycDocumentType = "id_card" | "passport" | "other";
export type KycSubmissionStatus = "draft" | "pending" | "approved" | "rejected";

export interface KycSubmissionView {
  id: string;
  targetLevel: number;
  documentType: KycDocumentType;
  status: KycSubmissionStatus;
  reviewReason: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface KycStatusView {
  kycLevel: number;
  submission: KycSubmissionView | null;
}

export interface UploadTarget {
  kind: "front" | "back" | "selfie";
  path: string;
  token: string;
  signedUrl: string;
}
