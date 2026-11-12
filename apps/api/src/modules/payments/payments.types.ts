export interface MerchantPreview {
  merchantCode: string;
  businessName: string;
}

export interface MerchantPaymentInput {
  fromUserId: string;
  merchantCode: string;
  amount: number;
  idempotencyKey: string;
  reference: string | null;
}

export interface MerchantPaymentResult {
  transactionId: string;
  replayed: boolean;
  amount: number;
  currency: string;
  merchantCode: string;
  businessName: string;
}

export interface PaymentService {
  resolveQr(payload: string): Promise<MerchantPreview | null>;
  payMerchant(input: MerchantPaymentInput): Promise<MerchantPaymentResult>;
}

export class PaymentError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
