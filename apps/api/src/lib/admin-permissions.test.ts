import { describe, expect, it } from "vitest";
import { can, isAdminRole, permissionsOf, type AdminPermission } from "./admin-permissions.js";

const ALL: AdminPermission[] = [
  "overview:read",
  "user:read",
  "kyc:read",
  "kyc:review",
  "merchant:read",
  "merchant:manage",
  "account:freeze",
  "audit:read",
];

describe("admin-permissions", () => {
  it("support só lê o resumo, utilizadores e comerciantes", () => {
    expect(can("support", "overview:read")).toBe(true);
    expect(can("support", "user:read")).toBe(true);
    expect(can("support", "merchant:read")).toBe(true);
    expect(can("support", "kyc:read")).toBe(false);
    expect(can("support", "kyc:review")).toBe(false);
    expect(can("support", "merchant:manage")).toBe(false);
    expect(can("support", "account:freeze")).toBe(false);
    expect(can("support", "audit:read")).toBe(false);
  });

  it("reviewer revê KYC e gere comerciantes, mas não congela nem vê a auditoria", () => {
    expect(can("reviewer", "kyc:read")).toBe(true);
    expect(can("reviewer", "kyc:review")).toBe(true);
    expect(can("reviewer", "merchant:manage")).toBe(true);
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
    for (const role of ["support", "reviewer", "admin"] as const) {
      const list = permissionsOf(role);
      for (const permission of ALL) {
        expect(list.includes(permission)).toBe(can(role, permission));
      }
    }
    permissionsOf("admin").pop();
    expect(can("admin", "audit:read")).toBe(true);
  });
});
