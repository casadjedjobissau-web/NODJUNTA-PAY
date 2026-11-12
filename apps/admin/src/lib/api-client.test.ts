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
  it("envia o token e o corpo JSON e devolve o resultado", async () => {
    const { fetchFn, calls } = makeFetch([jsonResponse({ status: "approved" })]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    const result = await client.request<{ status: string }>("/admin/v1/x", {
      method: "POST",
      body: { approve: true },
    });

    expect(result).toEqual({ status: "approved" });
    expect(calls[0]?.url).toBe("https://api.exemplo.local/admin/v1/x");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"approve":true}');
    expect(headersOf(calls[0]).Authorization).toBe("Bearer token-1");
    expect(headersOf(calls[0])["Content-Type"]).toBe("application/json");
  });

  it("converte o corpo de erro da API em ApiError", async () => {
    const { fetchFn } = makeFetch([jsonResponse({ error: "forbidden", message: "Sem permissão." }, 403)]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    const error = await client.request("/admin/v1/x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: "forbidden", message: "Sem permissão." });
  });

  it("devolve undefined em respostas 204", async () => {
    const { fetchFn } = makeFetch([new Response(null, { status: 204 })]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    expect(await client.request("/admin/v1/x", { method: "POST" })).toBeUndefined();
  });

  it("falha de rede vira network_error com status 0", async () => {
    const { fetchFn } = makeFetch([new Error("rede em baixo")]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-1",
      fetchFn,
    });

    await expect(client.request("/admin/v1/x")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
    });
  });

  it("em 401 renova o token e repete o pedido uma vez", async () => {
    const { fetchFn, calls } = makeFetch([
      jsonResponse({ error: "unauthorized", message: "expirou" }, 401),
      jsonResponse({ ok: true }),
    ]);
    const client = createApiClient({
      baseUrl: "https://api.exemplo.local",
      getToken: async () => "token-velho",
      refreshToken: async () => "token-novo",
      fetchFn,
    });

    const result = await client.request<{ ok: boolean }>("/admin/v1/x");

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(headersOf(calls[0]).Authorization).toBe("Bearer token-velho");
    expect(headersOf(calls[1]).Authorization).toBe("Bearer token-novo");
  });
});
