export const PHONE_CHANGE_STATUSES = ["pending", "approved", "rejected"] as const;

export type PhoneChangeStatus = (typeof PHONE_CHANGE_STATUSES)[number];

export function toPhoneChangeStatus(value: unknown): PhoneChangeStatus {
  return PHONE_CHANGE_STATUSES.find((status) => status === value) ?? "pending";
}

export interface PhoneChangeItem {
  id: string;
  seq: number;
  userId: string;
  fullName: string | null;
  oldPhoneMasked: string | null;
  newPhone: string;
  reason: string;
  evidenceNote: string;
  status: PhoneChangeStatus;
  createdBy: string;
  decidedBy: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface CreatePhoneChangeInput {
  userId: string;
  newPhone: string;
  reason: string;
  evidence: string;
}

export interface PhoneChangeService {
  list(status: PhoneChangeStatus | null, limit: number): Promise<PhoneChangeItem[]>;
  create(adminId: string, input: CreatePhoneChangeInput): Promise<{ id: string }>;
  decide(
    adminId: string,
    requestId: string,
    approve: boolean,
    reason: string | null,
  ): Promise<"approved" | "rejected">;
}

export class PhoneChangeError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "PhoneChangeError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
