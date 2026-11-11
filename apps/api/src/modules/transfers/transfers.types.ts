export interface TransferInput {
  fromUserId: string;
  toPhone: string;
  amount: number;
  idempotencyKey: string;
  reference: string | null;
}

export interface TransferResult {
  transactionId: string;
  replayed: boolean;
  amount: number;
  currency: string;
  toPhone: string;
}

export interface TransferService {
  createTransfer(input: TransferInput): Promise<TransferResult>;
}

export class TransferError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "TransferError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
