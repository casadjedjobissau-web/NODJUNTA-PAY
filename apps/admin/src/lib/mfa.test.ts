import { describe, expect, it } from "vitest";
import { MfaError, TOTP_LENGTH, decideMfaStep, isValidTotpCode, mfaErrorMessage, sanitizeTotp } from "./mfa";

describe("sanitizeTotp e isValidTotpCode", () => {
  it("remove o que não é dígito e limita a 6", () => {
    expect(TOTP_LENGTH).toBe(6);
    expect(sanitizeTotp("123 456")).toBe("123456");
    expect(sanitizeTotp("12-34-56-78")).toBe("123456");
    expect(sanitizeTotp("abc")).toBe("");
  });

  it("não aceita dígitos de outros alfabetos", () => {
    expect(sanitizeTotp("١٢٣٤٥٦")).toBe("");
  });

  it("só aceita exatamente 6 dígitos", () => {
    expect(isValidTotpCode("123456")).toBe(true);
    expect(isValidTotpCode("000000")).toBe(true);
    for (const value of ["", "12345", "1234567", "12345a", "123 456", "١٢٣٤٥٦"]) {
      expect(isValidTotpCode(value)).toBe(false);
    }
  });
});

describe("decideMfaStep", () => {
  it("aal2 está concluído, mesmo sem a lista de autenticadores", () => {
    expect(decideMfaStep({ currentLevel: "aal2", nextLevel: "aal2" }, [])).toEqual({ step: "done" });
  });

  it("com um autenticador confirmado, pede o código", () => {
    expect(decideMfaStep({ currentLevel: "aal1", nextLevel: "aal2" }, [{ id: "f1", status: "verified" }])).toEqual({
      step: "challenge",
      factorId: "f1",
    });
  });

  it("escolhe o primeiro autenticador confirmado e ignora os por confirmar", () => {
    const factors = [
      { id: "f0", status: "unverified" },
      { id: "f1", status: "verified" },
      { id: "f2", status: "verified" },
    ];

    expect(decideMfaStep({ currentLevel: "aal1", nextLevel: "aal2" }, factors)).toEqual({
      step: "challenge",
      factorId: "f1",
    });
  });

  it("sem nenhum autenticador confirmado, pede a inscrição", () => {
    expect(decideMfaStep({ currentLevel: "aal1", nextLevel: "aal1" }, [])).toEqual({ step: "enroll" });
    expect(decideMfaStep({ currentLevel: "aal1", nextLevel: "aal1" }, [{ id: "f0", status: "unverified" }])).toEqual({
      step: "enroll",
    });
  });

  it("falha fechada: um nível em falta não conta como concluído", () => {
    expect(decideMfaStep({ currentLevel: null, nextLevel: null }, [])).toEqual({ step: "enroll" });
    expect(decideMfaStep({ currentLevel: "aal3", nextLevel: null }, [])).toEqual({ step: "enroll" });
  });
});

describe("mfaErrorMessage", () => {
  it("código inválido ou expirado", () => {
    const expected = "Código incorreto ou expirado. Confirme a hora do telemóvel e tente outra vez.";
    expect(mfaErrorMessage("Invalid TOTP code entered")).toBe(expected);
    expect(mfaErrorMessage("MFA challenge has expired")).toBe(expected);
  });

  it("demasiadas tentativas", () => {
    expect(mfaErrorMessage("Request rate limit reached")).toBe("Demasiadas tentativas. Aguarde um minuto e tente outra vez.");
    expect(mfaErrorMessage("Too many requests")).toBe("Demasiadas tentativas. Aguarde um minuto e tente outra vez.");
  });

  it("falha de ligação", () => {
    expect(mfaErrorMessage("Network request failed")).toBe("Sem ligação ao servidor. Verifique a internet e tente novamente.");
  });

  it("qualquer outra coisa, ou texto vazio, dá a mensagem genérica", () => {
    const expected = "Não foi possível confirmar o código. Tente novamente.";
    expect(mfaErrorMessage("algo estranho")).toBe(expected);
    expect(mfaErrorMessage("")).toBe(expected);
  });

  it("MfaError é um Error com o nome certo", () => {
    const error = new MfaError("teste");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MfaError");
    expect(error.message).toBe("teste");
  });
});
