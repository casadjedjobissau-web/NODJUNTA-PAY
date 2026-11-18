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
  "reports:read",
  "phone_change:request",
  "phone_change:approve",
];

const ROLES: AdminRole[] = ["support", "reviewer", "admin"];

describe("admin-permissions", () => {
  it("support lê o resumo, utilizadores e comerciantes e atende pedidos de suporte, e nada mais", () => {
    for (const permission of ["overview:read", "user:read", "merchant:read", "support:read", "support:reply"] as const) {
      expect(can("support", permission)).toBe(true);
    }
    for (const permission of [
      "kyc:read",
      "kyc:review",
      "merchant:manage",
      "account:freeze",
      "audit:read",
      "reports:read",
      "phone_change:request",
      "phone_change:approve",
    ] as const) {
      expect(can("support", permission)).toBe(false);
    }
  });

  it("reviewer revê KYC, gere comerciantes, atende suporte e pede trocas de número, mas não decide nem congela", () => {
    for (const permission of [
      "kyc:read",
      "kyc:review",
      "merchant:manage",
      "support:read",
      "support:reply",
      "phone_change:request",
    ] as const) {
      expect(can("reviewer", permission)).toBe(true);
    }
    for (const permission of ["account:freeze", "audit:read", "reports:read", "phone_change:approve"] as const) {
      expect(can("reviewer", permission)).toBe(false);
    }
  });

  it("admin tem todas as permissões", () => {
    for (const permission of ALL) {
      expect(can("admin", permission)).toBe(true);
    }
  });

  it("só o admin vê os relatórios", () => {
    expect(can("support", "reports:read")).toBe(false);
    expect(can("reviewer", "reports:read")).toBe(false);
    expect(can("admin", "reports:read")).toBe(true);
  });

  it("pedir uma troca de número cabe ao revisor e ao admin, e decidir cabe só ao admin", () => {
    expect(can("support", "phone_change:request")).toBe(false);
    expect(can("reviewer", "phone_change:request")).toBe(true);
    expect(can("admin", "phone_change:request")).toBe(true);

    expect(can("support", "phone_change:approve")).toBe(false);
    expect(can("reviewer", "phone_change:approve")).toBe(false);
    expect(can("admin", "phone_change:approve")).toBe(true);
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
