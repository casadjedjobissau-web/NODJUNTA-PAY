import { describe, expect, it } from "vitest";
import { can, isAdminRole, permissionsOf, type AdminPermission, type AdminRole } from "./admin-permissions.js";

const ALL: AdminPermission[] = [
  "overview:read",
  "user:read",
  "kyc:read",
  "kyc:review",
  "merchant:read",
  "merchant:manage",
  "support:read",
  "support:reply",
  "account:freeze",
  "audit:read",
];

const ROLES: AdminRole[] = ["support", "reviewer", "admin"];

describe("admin-permissions", () => {
  it("support lê o resumo, utilizadores e comerciantes e atende pedidos de suporte", () => {
    for (const permission of ["overview:read", "user:read", "merchant:read", "support:read", "support:reply"] as const) {
      expect(can("support", permission)).toBe(true);
    }
    for (const permission of ["kyc:read", "kyc:review", "merchant:manage", "account:freeze", "audit:read"] as const) {
      expect(can("support", permission)).toBe(false);
    }
  });

  it("reviewer revê KYC e gere comerciantes, e também atende suporte, mas não congela nem vê a auditoria", () => {
    for (const permission of ["kyc:read", "kyc:review", "merchant:manage", "support:read", "support:reply"] as const) {
      expect(can("reviewer", permission)).toBe(true);
    }
    expect(can("reviewer", "account:freeze")).toBe(false);
    expect(can("reviewer", "audit:read")).toBe(false);
  });

  it("admin tem todas as permissões", () => {
    for (const permission of ALL) {
      expect(can("admin", permission)).toBe(true);
    }
  });

  it("isAdminRole só aceita os três papéis", () => {
    expect(isAdminRole("support")).toBe(true);
    expect(isAdminRole("reviewer")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("root")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it("permissionsOf coincide com can e devolve uma cópia", () => {
    for (const role of ROLES) {
      const list = permissionsOf(role);
      for (const permission of ALL) {
        expect(list.includes(permission)).toBe(can(role, permission));
      }
    }
    permissionsOf("admin").pop();
    expect(can("admin", "audit:read")).toBe(true);
  });

  it("cada papel superior inclui todas as permissões do inferior", () => {
    for (const permission of permissionsOf("support")) {
      expect(can("reviewer", permission)).toBe(true);
    }
    for (const permission of permissionsOf("reviewer")) {
      expect(can("admin", permission)).toBe(true);
    }
  });
});
