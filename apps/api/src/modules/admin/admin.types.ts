import type { AdminRole } from "../../lib/admin-permissions.js";

export type KycReviewStatus = "pending" | "approved" | "rejected";
export type MerchantAdminStatus = "pending" | "active" | "suspended";

export interface AdminOverview {
  pendingKyc: number;
  pendingMerchants: number;
  pendingFunding: number;
  failedWebhooks: number;
  frozenWallets: number;
}

export interface AdminKycItem {
  id: string;
  userId: string;
  phone: string | null;
  fullName: string | null;
  currentLevel: number;
  targetLevel: number;
  documentType: string;
  status: KycReviewStatus;
  reviewReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface AdminKycDocument {
  kind: "front" | "back" | "selfie";
  url: string;
  expiresInSeconds: number;
}

export interface AdminMerchantItem {
  merchantCode: string;
  businessName: string;
  ownerId: string;
  ownerPhone: string | null;
  status: MerchantAdminStatus;
  createdAt: string;
}

export interface AdminUserView {
  userId: string;
  phone: string | null;
  fullName: string | null;
  kycLevel: number;
  walletBalance: number | null;
  walletStatus: string | null;
  merchantCode: string | null;
  createdAt: string;
}

export interface AdminAuditItem {
  id: number;
  actorId: string | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditPage {
  items: AdminAuditItem[];
  nextCursor: number | null;
}

export interface AdminService {
  getRole(userId: string): Promise<AdminRole | null>;
  overview(): Promise<AdminOverview>;
  listKyc(status: KycReviewStatus, limit: number): Promise<AdminKycItem[]>;
  kycDocuments(adminId: string, submissionId: string, ip: string | null): Promise<AdminKycDocument[]>;
  reviewKyc(
    adminId: string,
    submissionId: string,
    approve: boolean,
    reason: string | null,
  ): Promise<"approved" | "rejected">;
  listMerchants(status: MerchantAdminStatus | null, limit: number): Promise<AdminMerchantItem[]>;
  setMerchantStatus(
    adminId: string,
    merchantCode: string,
    status: "active" | "suspended",
  ): Promise<"active" | "suspended">;
  lookupUser(adminId: string, phone: string, ip: string | null): Promise<AdminUserView | null>;
  setWalletFrozen(
    adminId: string,
    userId: string,
    frozen: boolean,
    reason: string | null,
  ): Promise<"frozen" | "active">;
  listAudit(limit: number, before?: number): Promise<AdminAuditPage>;
}

export class AdminError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "AdminError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
