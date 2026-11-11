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

export interface StatementOptions {
  limit: number;
  before?: number;
}

export interface WalletService {
  getOrCreateWallet(userId: string): Promise<WalletView>;
  getStatement(userId: string, options: StatementOptions): Promise<StatementPage>;
}
