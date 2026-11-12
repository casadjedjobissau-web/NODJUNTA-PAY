import { describe, expect, it } from "vitest";
import { buildQrPayload, normalizeMerchantCode, parseQrPayload } from "./qr";

describe("qr", () => {
  it("constrói o payload com prefixo NJP1", () => {
    expect(buildQrPayload("AB12CD34")).toBe("NJP1:AB12CD34");
  });

  it("recusa construir payload com código inválido", () => {
    expect(() => buildQrPayload("abc")).toThrow();
  });

  it("lê o payload e normaliza para maiúsculas", () => {
    expect(parseQrPayload("NJP1:AB12CD34")).toBe("AB12CD34");
    expect(parseQrPayload("  NJP1:ab12cd34 ")).toBe("AB12CD34");
  });

  it("rejeita QR de outras origens e códigos mal formados", () => {
    expect(parseQrPayload("https://exemplo.com")).toBeNull();
    expect(parseQrPayload("NJP1:AB12")).toBeNull();
    expect(parseQrPayload("NJP1:ZZZZZZZZ")).toBeNull();
  });

  it("normalizeMerchantCode aceita espaços e minúsculas", () => {
    expect(normalizeMerchantCode(" ab12 cd34 ")).toBe("AB12CD34");
    expect(normalizeMerchantCode("ab12")).toBeNull();
    expect(normalizeMerchantCode("")).toBeNull();
  });
});
