import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv.js";

describe("csvCell", () => {
  it("null vira vazio e os números ficam como estão, incluindo os negativos", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(7000)).toBe("7000");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(3.5)).toBe("3.5");
  });

  it("números que não são finitos ficam vazios", () => {
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe("");
    expect(csvCell(Number.NEGATIVE_INFINITY)).toBe("");
  });

  it("texto simples não muda", () => {
    expect(csvCell("Loja da Maria")).toBe("Loja da Maria");
    expect(csvCell("2026-11-14")).toBe("2026-11-14");
    expect(csvCell("")).toBe("");
  });

  it("põe aspas quando há vírgula, aspas ou quebra de linha, e duplica as aspas", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('diz "olá"')).toBe('"diz ""olá"""');
    expect(csvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(csvCell("linha1\r\nlinha2")).toBe('"linha1\r\nlinha2"');
  });

  it("protege contra fórmulas que começam por = + - ou @", () => {
    expect(csvCell("=SUM(A1:A3)")).toBe("'=SUM(A1:A3)");
    expect(csvCell("+351 912 345 678")).toBe("'+351 912 345 678");
    expect(csvCell("-10 XOF")).toBe("'-10 XOF");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("protege também a tabulação e o retorno de carro no início", () => {
    expect(csvCell("\tteste")).toBe("'\tteste");
    expect(csvCell("\rteste")).toBe("\"'\rteste\"");
  });

  it("protege e põe aspas quando a fórmula tem vírgula", () => {
    expect(csvCell("=A,B")).toBe("\"'=A,B\"");
  });
});

describe("toCsv", () => {
  it("junta as linhas com CRLF, termina com CRLF e põe aspas num cabeçalho com vírgula", () => {
    expect(
      toCsv(
        ["a", "b"],
        [
          ["x", 1],
          ["y", 2],
        ],
      ),
    ).toBe("a,b\r\nx,1\r\ny,2\r\n");
    expect(toCsv(["a,b"], [])).toBe('"a,b"\r\n');
  });

  it("a marca UTF-8 (BOM) só existe quando é pedida", () => {
    expect(toCsv(["a"], [], { bom: true })).toBe("\uFEFFa\r\n");
    expect(toCsv(["a"], [])).toBe("a\r\n");
  });

  it("sem linhas só tem o cabeçalho", () => {
    expect(toCsv(["Dia", "Valor"], [])).toBe("Dia,Valor\r\n");
  });

  it("mistura nulos, números e textos", () => {
    expect(toCsv(["Dia", "Nota", "Valor"], [["2026-11-14", null, 5]])).toBe("Dia,Nota,Valor\r\n2026-11-14,,5\r\n");
  });
});
