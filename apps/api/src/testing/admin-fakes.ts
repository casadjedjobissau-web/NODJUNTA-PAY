import type { AdminRole } from "../lib/admin-permissions.js";
import type { AdminService } from "../modules/admin/admin.types.js";
import type { Authenticator } from "../plugins/auth.js";

export const ADMIN_TOKENS = {
  admin: "token-admin",
  reviewer: "token-reviewer",
  support: "token-support",
  user: "token-utilizador-normal",
} as const;

export const ADMIN_IDS = {
  admin: "aaaaaaaa-0000-4000-8000-00000000000a",
  reviewer: "aaaaaaaa-0000-4000-8000-00000000000b",
  support: "aaaaaaaa-0000-4000-8000-00000000000c",
  user: "aaaaaaaa-0000-4000-8000-00000000000d",
} as const;

const ROLE_BY_ID = new Map<string, AdminRole>([
  [ADMIN_IDS.admin, "admin"],
  [ADMIN_IDS.reviewer, "reviewer"],
  [ADMIN_IDS.support, "support"],
]);

export const SUB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const TARGET_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

export function adminAuthenticator(): Authenticator {
  const byToken = new Map<string, string>([
    [ADMIN_TOKENS.admin, ADMIN_IDS.admin],
    [ADMIN_TOKENS.reviewer, ADMIN_IDS.reviewer],
    [ADMIN_TOKENS.support, ADMIN_IDS.support],
    [ADMIN_TOKENS.user, ADMIN_IDS.user],
  ]);
  return async (token) => {
    const id = byToken.get(token);
    return id ? { id, phone: null } : null;
  };
}

export function makeFakeAdmin(overrides: Partial<AdminService> = {}): AdminService {
  return {
    getRole: async (userId) => ROLE_BY_ID.get(userId) ?? null,
    overview: async () => ({
      pendingKyc: 2,
      pendingMerchants: 1,
      pendingFunding: 0,
      failedWebhooks: 0,
      frozenWallets: 0,
    }),
    listKyc: async () => [],
    kycDocuments: async () => [{ kind: "front", url: "https://exemplo.local/front", expiresInSeconds: 60 }],
    reviewKyc: async (_adminId, _submissionId, approve) => (approve ? "approved" : "rejected"),
    listMerchants: async () => [],
    setMerchantStatus: async (_adminId, _code, status) => status,
    lookupUser: async () => ({
      userId: TARGET_USER_ID,
      phone: "+245955000002",
      fullName: "Maria Gomes",
      kycLevel: 1,
      walletBalance: 5000,
      walletStatus: "active",
      merchantCode: null,
      createdAt: "2026-11-10T12:00:00.000Z",
    }),
    setWalletFrozen: async (_adminId, _userId, frozen) => (frozen ? "frozen" : "active"),
    listAudit: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}
