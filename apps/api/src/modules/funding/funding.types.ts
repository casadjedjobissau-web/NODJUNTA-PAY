export type FundingKind = "deposit" | "withdrawal";
export type FundingStatus = "pending" | "completed" | "failed";
export type SandboxOutcome = "complete" | "fail";

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

export interface ProviderDepositInput {
  requestId: string;
  userId: string;
  amount: number;
  currency: string;
}

export interface ProviderWithdrawalInput extends ProviderDepositInput {
  destination: string;
}

export interface ProviderResponse {
  providerRef: string;
}

/**
 * Interface de integração com um provedor financeiro autorizado (banco, operadora, agregador).
 * Só existe a implementação sandbox. Uma implementação real exige contrato, credenciais
 * e a documentação oficial do provedor.
 */
export interface FundingProvider {
  readonly name: string;
  initiateDeposit(input: ProviderDepositInput): Promise<ProviderResponse>;
  initiateWithdrawal(input: ProviderWithdrawalInput): Promise<ProviderResponse>;
}

export interface FundingService {
  createDeposit(userId: string, amount: number, idempotencyKey: string): Promise<FundingResult>;
  createWithdrawal(
    userId: string,
    amount: number,
    destination: string,
    idempotencyKey: string,
  ): Promise<FundingResult>;
  list(userId: string, limit: number): Promise<FundingRequestView[]>;
  sandboxSettle(
    userId: string,
    requestId: string,
    outcome: SandboxOutcome,
  ): Promise<FundingRequestView>;
}

export class FundingError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "FundingError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
