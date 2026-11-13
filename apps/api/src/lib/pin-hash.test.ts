import { describe, expect, it } from "vitest";
import { DEFAULT_HASH_PARAMS, hashPin, verifyPin } from "./pin-hash.js";

const PEPPER = "pimenta-de-teste-com-mais-de-32-caracteres!!";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const GOOD = "482913";
const FAST = { N: 16, r: 8, p: 1 };

const SALT64 = `${"A".repeat(22)}==`;
const HASH64 = `${"A".repeat(43)}=`;

describe("pin-hash", () => {
  it("hashPin produz o formato scrypt com parâmetros e sal, sem expor o PIN nem a pimenta", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, FAST);
    const parts = hash.split("$");

    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(["scrypt", "16", "8", "1"]);
    expect(Buffer.from(parts[4] ?? "", "base64")).toHaveLength(16);
    expect(Buffer.from(parts[5] ?? "", "base64")).toHaveLength(32);
    expect(hash).not.toContain(GOOD);
    expect(hash).not.toContain(PEPPER);
  });

  it("o mesmo PIN gera hashes diferentes (sal aleatório)", async () => {
    const first = await hashPin(PEPPER, USER, GOOD, FAST);
    const second = await hashPin(PEPPER, USER, GOOD, FAST);
    expect(first).not.toBe(second);
  });

  it("verifica o PIN certo", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, FAST);
    expect(await verifyPin(PEPPER, USER, GOOD, hash)).toBe(true);
  });

  it("recusa um PIN errado", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, FAST);
    expect(await verifyPin(PEPPER, USER, "135790", hash)).toBe(false);
  });

  it("recusa o mesmo PIN para outro utilizador", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, FAST);
    expect(await verifyPin(PEPPER, OTHER_USER, GOOD, hash)).toBe(false);
  });

  it("recusa com outra pimenta", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, FAST);
    expect(await verifyPin("outra-pimenta-completamente-diferente-123456", USER, GOOD, hash)).toBe(false);
  });

  it("recusa hashes malformados", async () => {
    const malformed = [
      "",
      "abc",
      "scrypt$16$8$1$x",
      `bcrypt$16$8$1$${SALT64}$${HASH64}`,
      "scrypt$16$8$1$AAAA$AAAA",
    ];
    for (const stored of malformed) {
      expect(await verifyPin(PEPPER, USER, GOOD, stored)).toBe(false);
    }
  });

  it("recusa parâmetros absurdos sem calcular nada", async () => {
    const absurd = [
      `scrypt$1073741824$8$1$${SALT64}$${HASH64}`,
      `scrypt$1000$8$1$${SALT64}$${HASH64}`,
      `scrypt$16$0$1$${SALT64}$${HASH64}`,
      `scrypt$16$8$0$${SALT64}$${HASH64}`,
    ];
    for (const stored of absurd) {
      expect(await verifyPin(PEPPER, USER, GOOD, stored)).toBe(false);
    }
  });

  it("hashPin recusa parâmetros inválidos", async () => {
    await expect(hashPin(PEPPER, USER, GOOD, { N: 15, r: 8, p: 1 })).rejects.toThrow();
    await expect(hashPin(PEPPER, USER, GOOD, { N: 65536, r: 8, p: 1 })).rejects.toThrow();
    await expect(hashPin(PEPPER, USER, GOOD, { N: 16, r: 9, p: 1 })).rejects.toThrow();
    await expect(hashPin(PEPPER, USER, GOOD, { N: 16, r: 8, p: 5 })).rejects.toThrow();
  });

  it(
    "usa os parâmetros por omissão e verifica-os",
    async () => {
      const hash = await hashPin(PEPPER, USER, GOOD);
      const { N, r, p } = DEFAULT_HASH_PARAMS;
      expect(hash.startsWith(`scrypt$${N}$${r}$${p}$`)).toBe(true);
      expect(await verifyPin(PEPPER, USER, GOOD, hash)).toBe(true);
    },
    15000,
  );
});
