import { describe, expect, it } from "vitest";
import { hasPermission, visibleTabs } from "./access";
import type { AdminMe } from "./types";

const SUPPORT: AdminMe = {
  userId: "u1",
  role: "support",
  permissions: ["overview:read", "user:read", "merchant:read"],
};

const REVIEWER: AdminMe = {
  userId: "u2",
  role: "reviewer",
  permissions: ["overview:read", "user:read", "merchant:read", "merchant:manage", "kyc:read", "kyc:review"],
};

const ADMIN: AdminMe = {
  userId: "u3",
  role: "admin",
  permissions: [
    "overview:read",
    "user:read",
    "merchant:read",
    "merchant:manage",
    "kyc:read",
    "kyc:review",
    "account:freeze",
    "audit:read",
  ],
};

function ids(me: AdminMe | null): string[] {
  return visibleTabs(me).map((tab) => tab.id);
}

describe("access", () => {
  it("suporte vê resumo, comerciantes e utilizadores", () => {
    expect(ids(SUPPORT)).toEqual(["overview", "merchants", "users"]);
  });

  it("revisor também vê as verificações KYC", () => {
    expect(ids(REVIEWER)).toEqual(["overview", "kyc", "merchants", "users"]);
  });

  it("administrador vê tudo, incluindo a auditoria", () => {
    expect(ids(ADMIN)).toEqual(["overview", "kyc", "merchants", "users", "audit"]);
  });

  it("sem sessão administrativa não há separadores", () => {
    expect(ids(null)).toEqual([]);
    expect(hasPermission(null, "overview:read")).toBe(false);
  });

  it("hasPermission segue a lista de permissões devolvida pela API", () => {
    expect(hasPermission(REVIEWER, "kyc:review")).toBe(true);
    expect(hasPermission(REVIEWER, "account:freeze")).toBe(false);
    expect(hasPermission(ADMIN, "account:freeze")).toBe(true);
  });
});
