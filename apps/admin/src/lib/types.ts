export type AdminRole = "support" | "reviewer" | "admin";

export type AdminPermission =
  | "overview:read"
  | "user:read"
  | "kyc:read"
  | "kyc:review"
  | "merchant:read"
  | "merchant:manage"
  | "account:freeze"
  | "audit:read";

export interface AdminMe {
  userId: string;
  role: AdminRole;
  permissions: AdminPermission[];
}

export interface Overview {
  pendingKyc: number;
  pendingMerchants: number;
  pendingFunding: number;
  failedWebhooks: number;
  frozenWallets: number;
}

export type KycStatus = "pending" | "approved" | "rejected";

export interface KycItem {
  id: string;
  userId: string;
  phone: string | null;
  fullName: string | null;
  currentLevel: number;
  targetLevel: number;
  documentType: string;
  status: KycStatus;
  reviewReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export type KycDocumentKind = "front" | "back" | "selfie";

export interface KycDocument {
  kind: KycDocumentKind;
  url: string;
  expiresInSeconds: number;
}

export type MerchantStatus = "pending" | "active" | "suspended";

export interface MerchantItem {
  merchantCode: string;
  businessName: string;
  ownerId: string;
  ownerPhone: string | null;
  status: MerchantStatus;
  createdAt: string;
}

export interface UserView {
  userId: string;
  phone: string | null;
  fullName: string | null;
  kycLevel: number;
  walletBalance: number | null;
  walletStatus: string | null;
  merchantCode: string | null;
  createdAt: string;
}

export interface AuditItem {
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

export interface AuditPage {
  items: AuditItem[];
  nextCursor: number | null;
}
