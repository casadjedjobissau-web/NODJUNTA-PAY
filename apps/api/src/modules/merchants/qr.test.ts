import { describe, expect, it } from "vitest";
import { buildQrPayload, isMerchantCode, parseQrPayload } from "./qr.js";

describe("QR de comerciante", () => {
  it("constrói o payload com prefixo NJP1", () => {
    expect(buildQrPayload("AB12CD34")).toBe("NJP1:AB12CD34");
  });

  it("recusa construir payload com código inválido", () => {
    expect(() => buildQrPayload("abc")).toThrow();
  });

  it("lê o payload e normaliza para maiúsculas", () => {
    expect(parseQrPayload("NJP1:AB12CD34")).toBe("AB12CD34");
    expect(parseQrPayload("  NJP1:ab12cd34 ")).toBe("AB12CD34");
    expect(isMerchantCode("AB12CD34")).toBe(true);
  });

  it("rejeita prefixo errado ou código com tamanho errado", () => {
    expect(parseQrPayload("XYZ:AB12CD34")).toBeNull();
    expect(parseQrPayload("NJP1:AB12")).toBeNull();
    expect(parseQrPayload("NJP1:ZZZZZZZZ")).toBeNull();
  });
});
