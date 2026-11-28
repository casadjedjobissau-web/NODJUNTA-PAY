import { describe, expect, it } from "vitest";
import { createNoStoreHook } from "./no-store.js";

function fakeReply(initial?: string) {
  const headers = new Map<string, string>();
  if (initial !== undefined) {
    headers.set("cache-control", initial);
  }
  return {
    headers,
    hasHeader: (name: string) => headers.has(name),
    header: (name: string, value: string) => {
      headers.set(name, value);
    },
  };
}

describe("createNoStoreHook", () => {
  it("acrescenta no-store quando a resposta não tem Cache-Control", async () => {
    const reply = fakeReply();

    await createNoStoreHook()({} as never, reply as never, "corpo");

    expect(reply.headers.get("cache-control")).toBe("no-store");
  });

  it("mantém o valor que a rota já definiu", async () => {
    const reply = fakeReply("private, max-age=5");

    await createNoStoreHook()({} as never, reply as never, "corpo");

    expect(reply.headers.get("cache-control")).toBe("private, max-age=5");
  });

  it("devolve o corpo da resposta sem lhe tocar, seja texto, objeto ou Buffer", async () => {
    const hook = createNoStoreHook();
    const buffer = Buffer.from("conteúdo");
    const object = { saldo: 6000 };

    expect(await hook({} as never, fakeReply() as never, "texto")).toBe("texto");
    expect(await hook({} as never, fakeReply() as never, object)).toBe(object);
    expect(await hook({} as never, fakeReply() as never, buffer)).toBe(buffer);
  });
});
