import { describe, expect, it } from "vitest";
import {
  documentTypeLabel,
  formatAmount,
  formatDateTime,
  formatMoney,
  formatPhone,
  kindLabel,
  kycStatusLabel,
  merchantStatusLabel,
  normalizeLookupPhone,
  roleLabel,
  walletStatusLabel,
} from "./format";

const NBSP = "\u00A0";

describe("format", () => {
  it("formatAmount agrupa milhares e trata negativos", () => {
    expect(formatAmount(0)).toBe("0");
    expect(formatAmount(1000)).toBe(`1${NBSP}000`);
    expect(formatAmount(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatAmount(-4000)).toBe(`-4${NBSP}000`);
  });

  it("formatMoney acrescenta a moeda", () => {
    expect(formatMoney(5000)).toBe(`5${NBSP}000${NBSP}XOF`);
  });

  it("normalizeLookupPhone aceita vários formatos", () => {
    expect(normalizeLookupPhone("955000002")).toBe("+245955000002");
    expect(normalizeLookupPhone("+245 955 000 002")).toBe("+245955000002");
    expect(normalizeLookupPhone("00245955000002")).toBe("+245955000002");
    expect(normalizeLookupPhone("245955000002")).toBe("+245955000002");
  });

  it("normalizeLookupPhone rejeita valores inválidos", () => {
    expect(normalizeLookupPhone("")).toBeNull();
    expect(normalizeLookupPhone("95500000")).toBeNull();
    expect(normalizeLookupPhone("+351912345678")).toBeNull();
    expect(normalizeLookupPhone("95500000a")).toBeNull();
  });

  it("formatPhone agrupa em três e trata nulos e números de outros países", () => {
    expect(formatPhone("+245955000002")).toBe("+245 955 000 002");
    expect(formatPhone("+351912345678")).toBe("+351912345678");
    expect(formatPhone(null)).toBe("—");
  });

  it("formatDateTime formata em dd/mm/aaaa hh:mm e trata valores inválidos", () => {
    const iso = new Date(2026, 10, 12, 9, 5).toISOString();
    expect(formatDateTime(iso)).toBe("12/11/2026 09:05");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("não é uma data")).toBe("—");
  });

  it("nomes de estados, documentos e papéis", () => {
    expect(kycStatusLabel("pending")).toBe("Pendente");
    expect(kycStatusLabel("approved")).toBe("Aprovado");
    expect(kycStatusLabel("rejected")).toBe("Recusado");
    expect(documentTypeLabel("id_card")).toBe("Bilhete de identidade");
    expect(documentTypeLabel("algo_novo")).toBe("algo_novo");
    expect(kindLabel("selfie")).toBe("Selfie");
    expect(merchantStatusLabel("suspended")).toBe("Suspenso");
    expect(roleLabel("reviewer")).toBe("Revisor");
  });

  it("walletStatusLabel", () => {
    expect(walletStatusLabel("active")).toBe("Ativa");
    expect(walletStatusLabel("frozen")).toBe("Congelada");
    expect(walletStatusLabel("closed")).toBe("Encerrada");
    expect(walletStatusLabel(null)).toBe("—");
  });
});
