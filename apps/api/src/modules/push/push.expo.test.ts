import { describe, expect, it } from "vitest";
import { EXPO_BATCH, EXPO_PUSH_URL, createExpoPushSender, isExpoPushToken } from "./push.expo.js";
import type { PushMessage } from "./push.types.js";

interface Call {
  url: string;
  init: RequestInit;
}

function makeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetchFn, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function message(to: string): PushMessage {
  return { to, title: "Dinheiro recebido", body: "Recebeu 4 000 XOF.", data: { amount: 4000 } };
}

function headersOf(call: Call | undefined): Record<string, string> {
  return (call?.init.headers ?? {}) as Record<string, string>;
}

function bodyOf(call: Call | undefined): unknown[] {
  return JSON.parse(String(call?.init.body)) as unknown[];
}

describe("isExpoPushToken", () => {
  it("aceita os dois formatos de token do Expo", () => {
    expect(isExpoPushToken("ExponentPushToken[abc123]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xyz-789_A]")).toBe(true);
  });

  it("rejeita valores que não são tokens", () => {
    for (const value of ["", "token", "ExponentPushToken[]", "ExponentPushToken[a b]", "ExponentPushToken[abc", "xExponentPushToken[abc]"]) {
      expect(isExpoPushToken(value)).toBe(false);
    }
  });
});

describe("createExpoPushSender", () => {
  it("envia um POST com a lista de mensagens e sem Authorization quando não há token", async () => {
    const { fetchFn, calls } = makeFetch(() => json({ data: [{ status: "ok" }] }));
    const sender = createExpoPushSender({ fetchFn });

    const tickets = await sender.send([message("ExponentPushToken[abc123]")]);

    expect(tickets).toEqual([{ status: "ok" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(EXPO_PUSH_URL);
    expect(calls[0]?.init.method).toBe("POST");
    expect(headersOf(calls[0])["Content-Type"]).toBe("application/json");
    expect(headersOf(calls[0]).Authorization).toBeUndefined();
    expect(bodyOf(calls[0])).toEqual([
      {
        to: "ExponentPushToken[abc123]",
        title: "Dinheiro recebido",
        body: "Recebeu 4 000 XOF.",
        data: { amount: 4000 },
        sound: "default",
      },
    ]);
  });

  it("inclui o cabeçalho Authorization quando há token de acesso", async () => {
    const { fetchFn, calls } = makeFetch(() => json({ data: [{ status: "ok" }] }));
    const sender = createExpoPushSender({ fetchFn, accessToken: "token-de-teste-123" });

    await sender.send([message("ExponentPushToken[abc123]")]);

    expect(headersOf(calls[0]).Authorization).toBe("Bearer token-de-teste-123");
  });

  it("converte os bilhetes de resposta, com 'unknown' quando o erro não tem detalhe", async () => {
    const { fetchFn } = makeFetch(() =>
      json({
        data: [
          { status: "ok" },
          { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
          { status: "error" },
        ],
      }),
    );
    const sender = createExpoPushSender({ fetchFn });

    const tickets = await sender.send([
      message("ExponentPushToken[a1]"),
      message("ExponentPushToken[a2]"),
      message("ExponentPushToken[a3]"),
    ]);

    expect(tickets).toEqual([
      { status: "ok" },
      { status: "error", error: "DeviceNotRegistered" },
      { status: "error", error: "unknown" },
    ]);
  });

  it("divide o envio em lotes de 100 mensagens", async () => {
    const { fetchFn, calls } = makeFetch((call) => {
      const size = bodyOf(call).length;
      return json({ data: Array.from({ length: size }, () => ({ status: "ok" })) });
    });
    const sender = createExpoPushSender({ fetchFn });
    const messages = Array.from({ length: 250 }, (_unused, index) => message(`ExponentPushToken[t${index}]`));

    const tickets = await sender.send(messages);

    expect(EXPO_BATCH).toBe(100);
    expect(calls.map((call) => bodyOf(call).length)).toEqual([100, 100, 50]);
    expect(tickets).toHaveLength(250);
  });

  it("falha quando o serviço responde com um erro HTTP", async () => {
    const { fetchFn } = makeFetch(() => new Response("indisponível", { status: 503 }));
    const sender = createExpoPushSender({ fetchFn });

    await expect(sender.send([message("ExponentPushToken[abc123]")])).rejects.toThrow("503");
  });

  it("falha quando o número de bilhetes não coincide com o de mensagens", async () => {
    const { fetchFn } = makeFetch(() => json({ data: [{ status: "ok" }] }));
    const sender = createExpoPushSender({ fetchFn });

    await expect(
      sender.send([message("ExponentPushToken[a1]"), message("ExponentPushToken[a2]")]),
    ).rejects.toThrow("inesperada");
  });

  it("falha quando o pedido não chega ao servidor", async () => {
    const { fetchFn } = makeFetch(() => {
      throw new Error("rede em baixo");
    });
    const sender = createExpoPushSender({ fetchFn });

    await expect(sender.send([message("ExponentPushToken[abc123]")])).rejects.toThrow("rede em baixo");
  });

  it("aborta o pedido quando o tempo esgota", async () => {
    const fetchFn = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("abortado")));
      })) as typeof fetch;
    const sender = createExpoPushSender({ fetchFn, timeoutMs: 20 });

    await expect(sender.send([message("ExponentPushToken[abc123]")])).rejects.toThrow("abortado");
  });
});
