import { describe, expect, it } from "vitest";
import { encodePart, makeJwt } from "../testing/tokens.js";
import { readAal } from "./jwt-claims.js";

describe("readAal", () => {
  it("lê aal2", () => {
    expect(readAal(makeJwt({ sub: "u1", aal: "aal2" }))).toBe("aal2");
  });

  it("lê aal1", () => {
    expect(readAal(makeJwt({ sub: "u1", aal: "aal1" }))).toBe("aal1");
  });

  it("sem a alegação aal devolve null", () => {
    expect(readAal(makeJwt({ sub: "u1" }))).toBeNull();
  });

  it("valores desconhecidos de aal devolvem null", () => {
    for (const aal of ["aal3", "AAL2", "", 2, true, null]) {
      expect(readAal(makeJwt({ aal }))).toBeNull();
    }
  });

  it("um token que não tem exatamente três partes devolve null", () => {
    for (const token of ["", "a", "a.b", "a.b.c.d"]) {
      expect(readAal(token)).toBeNull();
    }
  });

  it("uma parte do meio vazia devolve null", () => {
    expect(readAal("a..c")).toBeNull();
  });

  it("um conteúdo que não é JSON devolve null", () => {
    expect(readAal(`a.${encodePart("isto nao e json")}.c`)).toBeNull();
  });

  it("um JSON que não é um objeto devolve null", () => {
    for (const text of ['"aal2"', "null", "[]", "42", "true"]) {
      expect(readAal(`a.${encodePart(text)}.c`)).toBeNull();
    }
  });

  it("aceita conteúdo com acentos codificado em base64url", () => {
    expect(readAal(makeJwt({ aal: "aal2", name: "Maria Sá ção" }))).toBe("aal2");
  });

  it("nunca lança, mesmo com lixo", () => {
    for (const token of ["...", "%%%.%%%.%%%", "a.b.c", " . . ", "\u0000.\u0000.\u0000"]) {
      expect(() => readAal(token)).not.toThrow();
      expect(readAal(token)).toBeNull();
    }
  });
});
