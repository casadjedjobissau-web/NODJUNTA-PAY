import { describe, expect, it } from "vitest";
import { classifyDeletionError, blockerAction, isConfirmed } from "./account-deletion";
import { ApiError } from "./api-client";

describe("isConfirmed", () => {
  it("aceita a palavra em qualquer capitalização e com espaços à volta", () => {
    for (const text of ["ELIMINAR", "eliminar", "Eliminar", "  ELIMINAR  "]) {
      expect(isConfirmed(text)).toBe(true);
    }
  });

  it("recusa tudo o resto", () => {
    for (const text of ["", "   ", "ELIMINA", "ELIMINARR", "ELIMINAR TUDO", "SIM", "E L I M I N A R"]) {
      expect(isConfirmed(text)).toBe(false);
    }
  });
});

describe("blockerAction", () => {
  it("cada bloqueio resolúvel leva ao ecrã certo", () => {
    expect(blockerAction("balance")).toEqual({ label: "Levantar o saldo", href: "/withdraw" });
    expect(blockerAction("pending_requests")).toEqual({ label: "Ver pedidos pendentes", href: "/funding" });
    expect(blockerAction("frozen")).toEqual({ label: "Contactar o suporte", href: "/support" });
  });

  it("administração e códigos desconhecidos não têm ação", () => {
    expect(blockerAction("admin")).toBeNull();
    expect(blockerAction("algo_novo")).toBeNull();
  });
});

describe("classifyDeletionError", () => {
  it("um login antigo pede para entrar de novo", () => {
    expect(classifyDeletionError(new ApiError(403, "recent_login_required", "x"))).toBe("needs_login");
  });

  it("os bloqueios da conta pedem uma nova verificação", () => {
    for (const code of ["balance_not_zero", "pending_requests", "account_frozen", "admin_account"]) {
      expect(classifyDeletionError(new ApiError(409, code, "x"))).toBe("blocked");
    }
  });

  it("os erros do PIN são reconhecidos", () => {
    for (const code of ["invalid_pin", "pin_locked", "pin_not_set", "pin_required", "invalid_pin_format"]) {
      expect(classifyDeletionError(new ApiError(403, code, "x"))).toBe("pin");
    }
  });

  it("tudo o resto é 'other', incluindo erros que não vêm da API", () => {
    expect(classifyDeletionError(new ApiError(0, "network_error", "x"))).toBe("other");
    expect(classifyDeletionError(new ApiError(500, "internal_error", "x"))).toBe("other");
    expect(classifyDeletionError(new Error("x"))).toBe("other");
    expect(classifyDeletionError(null)).toBe("other");
  });
});
