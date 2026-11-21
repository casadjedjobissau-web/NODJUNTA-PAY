import { describe, expect, it } from "vitest";
import { withPin } from "./with-pin";

describe("withPin", () => {
  it("se o utilizador cancelar, a ação não é chamada", async () => {
    let calls = 0;

    const outcome = await withPin(
      async () => null,
      async () => {
        calls += 1;
        return "feito";
      },
    );

    expect(outcome).toEqual({ cancelled: true });
    expect(calls).toBe(0);
  });

  it("passa o PIN à ação e devolve o valor", async () => {
    const received: string[] = [];

    const outcome = await withPin(
      async () => "482913",
      async (pin) => {
        received.push(pin);
        return { ok: true };
      },
    );

    expect(outcome).toEqual({ cancelled: false, value: { ok: true } });
    expect(received).toEqual(["482913"]);
  });

  it("um erro da ação sobe a quem chamou", async () => {
    await expect(
      withPin(
        async () => "482913",
        async () => {
          throw new Error("rede em baixo");
        },
      ),
    ).rejects.toThrow("rede em baixo");
  });

  it("pede o PIN uma vez e chama a ação uma vez", async () => {
    let asks = 0;
    let actions = 0;

    await withPin(
      async () => {
        asks += 1;
        return "482913";
      },
      async () => {
        actions += 1;
        return 1;
      },
    );

    expect(asks).toBe(1);
    expect(actions).toBe(1);
  });

  it("se falhar ao pedir o PIN, o erro sobe e a ação não é chamada", async () => {
    let actions = 0;

    await expect(
      withPin(
        async () => {
          throw new Error("falha ao mostrar a folha");
        },
        async () => {
          actions += 1;
          return 1;
        },
      ),
    ).rejects.toThrow("falha ao mostrar a folha");
    expect(actions).toBe(0);
  });
});
