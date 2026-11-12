import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { createAttemptKeeper, isAmbiguousFailure } from "./attempt";

function makeKeeper() {
  let counter = 0;
  const keeper = createAttemptKeeper(() => {
    counter += 1;
    return `chave-${counter}`;
  });
  return { keeper, generated: () => counter };
}

describe("isAmbiguousFailure", () => {
  it("falha de rede e erros 5xx são ambíguos", () => {
    expect(isAmbiguousFailure(new ApiError(0, "network_error", "x"))).toBe(true);
    expect(isAmbiguousFailure(new ApiError(502, "provider_unavailable", "x"))).toBe(true);
    expect(isAmbiguousFailure(new ApiError(500, "internal_error", "x"))).toBe(true);
  });

  it("erros de negócio (4xx) não são ambíguos", () => {
    expect(isAmbiguousFailure(new ApiError(422, "insufficient_funds", "x"))).toBe(false);
    expect(isAmbiguousFailure(new ApiError(404, "recipient_not_found", "x"))).toBe(false);
  });

  it("erros que não vêm da API não são ambíguos", () => {
    expect(isAmbiguousFailure(new Error("x"))).toBe(false);
  });
});

describe("createAttemptKeeper", () => {
  it("dados iguais reutilizam a mesma chave", () => {
    const { keeper, generated } = makeKeeper();
    expect(keeper.acquire("a|100")).toBe("chave-1");
    expect(keeper.acquire("a|100")).toBe("chave-1");
    expect(generated()).toBe(1);
  });

  it("dados diferentes geram uma chave nova", () => {
    const { keeper } = makeKeeper();
    expect(keeper.acquire("a|100")).toBe("chave-1");
    expect(keeper.acquire("a|200")).toBe("chave-2");
  });

  it("reset descarta a chave", () => {
    const { keeper } = makeKeeper();
    keeper.acquire("a|100");
    keeper.reset();
    expect(keeper.acquire("a|100")).toBe("chave-2");
  });

  it("após falha ambígua mantém a chave", () => {
    const { keeper } = makeKeeper();
    keeper.acquire("a|100");
    keeper.settle(new ApiError(0, "network_error", "x"));
    expect(keeper.acquire("a|100")).toBe("chave-1");
  });

  it("após erro definitivo descarta a chave", () => {
    const { keeper } = makeKeeper();
    keeper.acquire("a|100");
    keeper.settle(new ApiError(422, "insufficient_funds", "x"));
    expect(keeper.acquire("a|100")).toBe("chave-2");
  });
});
