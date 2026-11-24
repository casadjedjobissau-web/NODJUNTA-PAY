import { describe, expect, it } from "vitest";
import { badgeText } from "./badge";

describe("badgeText", () => {
  it("sem notificações não mostra contador", () => {
    expect(badgeText(0)).toBeUndefined();
    expect(badgeText(-3)).toBeUndefined();
    expect(badgeText(Number.NaN)).toBeUndefined();
    expect(badgeText(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("mostra o número até 99", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(42)).toBe("42");
    expect(badgeText(99)).toBe("99");
  });

  it("acima de 99 mostra 99+", () => {
    expect(badgeText(100)).toBe("99+");
    expect(badgeText(5000)).toBe("99+");
  });

  it("um número com decimais é arredondado para baixo", () => {
    expect(badgeText(3.7)).toBe("3");
  });
});
