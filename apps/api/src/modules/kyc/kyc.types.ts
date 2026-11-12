export type KycDocumentType = "id_card" | "passport" | "other";
export type KycSubmissionStatus = "draft" | "pending" | "approved" | "rejected";
export type KycDocumentKind = "front" | "back" | "selfie";

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
  kind: KycDocumentKind;
  path: string;
  token: string;
  signedUrl: string;
}

export interface KycService {
  getStatus(userId: string): Promise<KycStatusView>;
  createSubmission(
    userId: string,
    targetLevel: number,
    documentType: KycDocumentType,
  ): Promise<KycSubmissionView>;
  createUploadTargets(
    userId: string,
    submissionId: string,
    kinds: KycDocumentKind[],
  ): Promise<UploadTarget[]>;
  submit(userId: string, submissionId: string): Promise<KycSubmissionView>;
}

export class KycError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "KycError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
