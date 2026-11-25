import { describe, expect, it } from "vitest";
import { TABS, hasPermission, visibleTabs } from "./access";
import type { AdminMe } from "./types";

const SUPPORT: AdminMe = {
  userId: "u1",
  role: "support",
  permissions: ["overview:read", "user:read", "merchant:read", "support:read", "support:reply"],
};

const REVIEWER: AdminMe = {
  userId: "u2",
  role: "reviewer",
  permissions: [
    "overview:read",
    "user:read",
    "merchant:read",
    "support:read",
    "support:reply",
    "merchant:manage",
    "kyc:read",
    "kyc:review",
    "phone_change:request",
    "fraud:review",
  ],
};

const ADMIN: AdminMe = {
  userId: "u3",
  role: "admin",
  permissions: [
    "overview:read",
    "user:read",
    "merchant:read",
    "support:read",
    "support:reply",
    "merchant:manage",
    "kyc:read",
    "kyc:review",
    "phone_change:request",
    "fraud:review",
    "account:freeze",
    "audit:read",
    "reports:read",
    "phone_change:approve",
  ],
};

function ids(me: AdminMe | null): string[] {
  return visibleTabs(me).map((tab) => tab.id);
}

describe("access", () => {
  it("suporte vê resumo, suporte, comerciantes e utilizadores", () => {
    expect(ids(SUPPORT)).toEqual(["overview", "support", "merchants", "users"]);
  });

  it("revisor também vê as verificações, as trocas de número e os alertas de fraude", () => {
    expect(ids(REVIEWER)).toEqual(["overview", "support", "kyc", "merchants", "users", "phones", "fraud"]);
  });

  it("administrador vê tudo, incluindo os relatórios e a auditoria", () => {
    expect(ids(ADMIN)).toEqual(["overview", "support", "kyc", "merchants", "users", "phones", "fraud", "reports", "audit"]);
  });

  it("só o administrador vê os relatórios e a auditoria", () => {
    for (const me of [SUPPORT, REVIEWER]) {
      expect(ids(me)).not.toContain("reports");
      expect(ids(me)).not.toContain("audit");
    }
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

  it("pedir uma troca de número e decidi-la são permissões diferentes", () => {
    expect(hasPermission(REVIEWER, "phone_change:request")).toBe(true);
    expect(hasPermission(REVIEWER, "phone_change:approve")).toBe(false);
    expect(hasPermission(ADMIN, "phone_change:approve")).toBe(true);
  });

  it("responder ao suporte é uma permissão à parte de ler", () => {
    const onlyRead: AdminMe = { userId: "u4", role: "support", permissions: ["overview:read", "support:read"] };

    expect(ids(onlyRead)).toEqual(["overview", "support"]);
    expect(hasPermission(onlyRead, "support:reply")).toBe(false);
  });

  it("cada separador tem um identificador diferente", () => {
    expect(new Set(TABS.map((tab) => tab.id)).size).toBe(TABS.length);
  });
});
