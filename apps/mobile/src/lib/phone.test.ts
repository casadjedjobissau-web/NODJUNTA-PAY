import { describe, expect, it } from "vitest";
import { formatPhone, normalizeGwPhone } from "./phone";

describe("normalizeGwPhone", () => {
  it("aceita número local de 9 dígitos", () => {
    expect(normalizeGwPhone("955000002")).toBe("+245955000002");
    expect(normalizeGwPhone("955 000 002")).toBe("+245955000002");
  });

  it("aceita o prefixo do país em vários formatos", () => {
    expect(normalizeGwPhone("+245955000002")).toBe("+245955000002");
    expect(normalizeGwPhone("+245 955 000 002")).toBe("+245955000002");
    expect(normalizeGwPhone("00245955000002")).toBe("+245955000002");
    expect(normalizeGwPhone("245955000002")).toBe("+245955000002");
    expect(normalizeGwPhone("(+245) 955-000-002")).toBe("+245955000002");
  });

  it("não confunde um número de outro país com um local", () => {
    expect(normalizeGwPhone("+955000002")).toBeNull();
    expect(normalizeGwPhone("+351912345678")).toBeNull();
  });

  it("rejeita tamanhos errados e caracteres inválidos", () => {
    expect(normalizeGwPhone("")).toBeNull();
    expect(normalizeGwPhone("95500000")).toBeNull();
    expect(normalizeGwPhone("9550000020")).toBeNull();
    expect(normalizeGwPhone("95500000a")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("formata em grupos de três", () => {
    expect(formatPhone("+245955000002")).toBe("+245 955 000 002");
  });

  it("devolve o texto original se não for um número da Guiné-Bissau", () => {
    expect(formatPhone("+351912345678")).toBe("+351912345678");
  });
});
