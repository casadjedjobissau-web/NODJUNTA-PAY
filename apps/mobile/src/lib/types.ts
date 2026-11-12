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
