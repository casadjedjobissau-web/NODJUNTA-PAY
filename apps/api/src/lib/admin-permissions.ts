export type AdminRole = "support" | "reviewer" | "admin";

export type AdminPermission =
  | "overview:read"
  | "user:read"
  | "kyc:read"
  | "kyc:review"
  | "merchant:read"
  | "merchant:manage"
  | "support:read"
  | "support:reply"
  | "account:freeze"
  | "audit:read"
  | "reports:read"
  | "phone_change:request"
  | "phone_change:approve"
  | "fraud:review";

const SUPPORT: readonly AdminPermission[] = [
  "overview:read",
  "user:read",
  "merchant:read",
  "support:read",
  "support:reply",
];

const REVIEWER: readonly AdminPermission[] = [
  ...SUPPORT,
  "merchant:manage",
  "kyc:read",
  "kyc:review",
  "phone_change:request",
  "fraud:review",
];

const ADMIN: readonly AdminPermission[] = [
  ...REVIEWER,
  "account:freeze",
  "audit:read",
  "reports:read",
  "phone_change:approve",
];

const GRANTS: Record<AdminRole, readonly AdminPermission[]> = {
  support: SUPPORT,
  reviewer: REVIEWER,
  admin: ADMIN,
};

export function isAdminRole(value: unknown): value is AdminRole {
  return value === "support" || value === "reviewer" || value === "admin";
}

export function can(role: AdminRole, permission: AdminPermission): boolean {
  return GRANTS[role].includes(permission);
}

export function permissionsOf(role: AdminRole): AdminPermission[] {
  return [...GRANTS[role]];
}
