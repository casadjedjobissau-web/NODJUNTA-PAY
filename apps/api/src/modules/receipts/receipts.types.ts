export type ReceiptKind = "transfer" | "merchant_payment" | "deposit" | "withdrawal" | "reversal";
export type ReceiptDirection = "in" | "out";

export interface ReceiptView {
  receiptNumber: string;
  transactionId: string;
  kind: ReceiptKind;
  direction: ReceiptDirection;
  amount: number;
  fee: number;
  total: number;
  currency: string;
  counterparty: {
    label: string | null;
    detail: string | null;
  };
  reference: string | null;
  occurredAt: string;
  issuedAt: string;
}

export interface ReceiptService {
  get(userId: string, transactionId: string): Promise<ReceiptView>;
}

export class ReceiptError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "ReceiptError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
