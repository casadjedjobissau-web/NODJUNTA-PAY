import { describe, expect, it } from "vitest";
import { base64ByteLength, base64ToArrayBuffer } from "./base64";

function bytesOf(input: string): number[] {
  return Array.from(new Uint8Array(base64ToArrayBuffer(input)));
}

describe("base64", () => {
  it("descodifica texto simples", () => {
    expect(bytesOf("TWFu")).toEqual([77, 97, 110]);
  });

  it("trata o preenchimento com '='", () => {
    expect(bytesOf("TWE=")).toEqual([77, 97]);
    expect(bytesOf("TQ==")).toEqual([77]);
  });

  it("ignora espaços e quebras de linha", () => {
    expect(bytesOf("TW\nFu ")).toEqual([77, 97, 110]);
  });

  it("rejeita caracteres inválidos", () => {
    expect(() => base64ToArrayBuffer("TW*u")).toThrow();
    expect(() => base64ToArrayBuffer("T")).toThrow();
  });

  it("base64ByteLength coincide com o tamanho descodificado", () => {
    for (const input of ["TWFu", "TWE=", "TQ==", "TWFuTWFu", "SGVsbG8gTsOUREpVTlRB"]) {
      expect(base64ByteLength(input)).toBe(base64ToArrayBuffer(input).byteLength);
    }
  });
});
