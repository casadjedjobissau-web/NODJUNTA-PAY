import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "./api-client";

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetch(responses: Array<Response | Error>) {
  const calls: FetchCall[] = [];
  let index = 0;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses[index];
    index += 1;
    if (next === undefined) {
      throw new Error("sem mais respostas simuladas");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as typeof fetch;
  return { fetchFn, calls };
}

function headersOf(call: FetchCall | undefined): Record<string, string> {
  return (call?.init.headers ?? {}) as Record<string, string>;
}

describe("createApiClient", () => {
  it("envia o token e devolve o JSON da resposta", async () => {
    const { fetchFn, calls } = makeFetch([jsonResponse({ balance: 6000 })]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    const result = await client.request<{ balance: number }>("/v1/wallet");

    expect(result).toEqual({ balance: 6000 });
    expect(calls[0]?.url).toBe("https://api.exemplo.local/v1/wallet");
    expect(calls[0]?.init.method).toBe("GET");
    expect(headersOf(calls[0]).Authorization).toBe("Bearer token-1");
  });

  it("envia corpo JSON e Idempotency-Key nos POST", async () => {
    const { fetchFn, calls } = makeFetch([jsonResponse({ ok: true }, 201)]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    await client.request("/v1/transfers", {
      method: "POST",
      body: { toPhone: "+245955000002", amount: 2500 },
      idempotencyKey: "chave-0001-abcdef",
    });

    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"toPhone":"+245955000002","amount":2500}');
    expect(headersOf(calls[0])["Content-Type"]).toBe("application/json");
    expect(headersOf(calls[0])["Idempotency-Key"]).toBe("chave-0001-abcdef");
  });

  it("converte o corpo de erro da API em ApiError", async () => {
    const { fetchFn } = makeFetch([
      jsonResponse({ error: "insufficient_funds", message: "Saldo insuficiente." }, 422),
    ]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    const error = await client.request("/v1/transfers", { method: "POST", body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "insufficient_funds",
      message: "Saldo insuficiente.",
    });
  });

  it("devolve undefined em respostas 204", async () => {
    const { fetchFn } = makeFetch([new Response(null, { status: 204 })]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    expect(await client.request("/v1/devices/dispositivo-0001", { method: "DELETE" })).toBeUndefined();
  });

  it("falha de rede vira ApiError network_error com status 0", async () => {
    const { fetchFn } = makeFetch([new Error("rede em baixo")]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    await expect(client.request("/v1/wallet")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
    });
  });

  it("tempo esgotado também vira network_error", async () => {
    const fetchFn = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("abortado")));
      })) as typeof fetch;
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
      timeoutMs: 20,
    });

    await expect(client.request("/v1/wallet")).rejects.toMatchObject({ code: "network_error" });
  });

  it("em 401 renova o token e repete o pedido uma vez", async () => {
    const { fetchFn, calls } = makeFetch([
      jsonResponse({ error: "unauthorized", message: "expirou" }, 401),
      jsonResponse({ balance: 100 }),
    ]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-velho",
      refreshToken: async () => "token-novo",
      fetchFn,
    });

    const result = await client.request<{ balance: number }>("/v1/wallet");

    expect(result.balance).toBe(100);
    expect(calls).toHaveLength(2);
    expect(headersOf(calls[0]).Authorization).toBe("Bearer token-velho");
    expect(headersOf(calls[1]).Authorization).toBe("Bearer token-novo");
  });

  it("não repete o pedido se a renovação não der um token novo", async () => {
    const { fetchFn, calls } = makeFetch([
      jsonResponse({ error: "unauthorized", message: "expirou" }, 401),
    ]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-velho",
      refreshToken: async () => null,
      fetchFn,
    });

    await expect(client.request("/v1/wallet")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(calls).toHaveLength(1);
  });

  it("usa código http_error quando o corpo de erro não é JSON", async () => {
    const { fetchFn } = makeFetch([new Response("<html>erro</html>", { status: 502 })]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    await expect(client.request("/v1/wallet")).rejects.toMatchObject({
      status: 502,
      code: "http_error",
    });
  });
});
