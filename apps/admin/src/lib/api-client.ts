export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  refreshToken?: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
}

const NETWORK_MESSAGE = "Sem ligação ao servidor. Verifique a internet e tente novamente.";

export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15000;

  async function send(path: string, req: RequestOptions, token: string | null): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (req.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      const init: RequestInit = {
        method: req.method ?? "GET",
        headers,
        signal: controller.signal,
      };
      if (req.body !== undefined) {
        init.body = JSON.stringify(req.body);
      }
      return await fetchFn(`${options.baseUrl}${path}`, init);
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(path: string, req: RequestOptions = {}): Promise<T> {
    const token = await options.getToken();
    let response: Response;
    try {
      response = await send(path, req, token);
    } catch {
      throw new ApiError(0, "network_error", NETWORK_MESSAGE);
    }

    // 401 significa que o pedido não foi processado: é seguro tentar de novo uma vez.
    if (response.status === 401 && options.refreshToken) {
      const fresh = await options.refreshToken();
      if (fresh && fresh !== token) {
        try {
          response = await send(path, req, fresh);
        } catch {
          throw new ApiError(0, "network_error", NETWORK_MESSAGE);
        }
      }
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!response.ok) {
      const body = (json ?? {}) as { error?: unknown; message?: unknown };
      const code = typeof body.error === "string" ? body.error : "http_error";
      const message =
        typeof body.message === "string" ? body.message : `Erro do servidor (${response.status}).`;
      throw new ApiError(response.status, code, message);
    }

    return json as T;
  }

  return { request };
}
