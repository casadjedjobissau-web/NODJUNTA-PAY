import { describe, expect, it } from "vitest";
import { initialsFromName } from "./initials";

describe("initialsFromName", () => {
  it("duas palavras: primeira letra de cada uma", () => {
    expect(initialsFromName("Maria Gomes")).toBe("MG");
  });

  it("uma palavra: só uma letra", () => {
    expect(initialsFromName("Fatumata")).toBe("F");
  });

  it("mais de duas palavras: primeira e última", () => {
    expect(initialsFromName("Ana Maria da Silva")).toBe("AS");
  });

  it("ignora espaços a mais e converte para maiúsculas", () => {
    expect(initialsFromName("  joão   pereira ")).toBe("JP");
  });

  it("mantém os acentos", () => {
    expect(initialsFromName("Élia Sá")).toBe("ÉS");
  });

  it("vazio, nulo ou indefinido dá ponto de interrogação", () => {
    expect(initialsFromName("")).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
    expect(initialsFromName(null)).toBe("?");
    expect(initialsFromName(undefined)).toBe("?");
  });

  it("ignora pontuação no início das palavras", () => {
    expect(initialsFromName("(Maria) Gomes")).toBe("MG");
  });

  it("só pontuação dá ponto de interrogação", () => {
    expect(initialsFromName("--- ***")).toBe("?");
  });
});
