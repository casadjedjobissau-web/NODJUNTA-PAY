export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  // Campos extra da resposta de erro, por exemplo attemptsLeft e lockedUntil.
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  // PIN de 6 dígitos. Vai só no cabeçalho X-Pin, nunca no corpo nem no endereço.
  pin?: string;
}

const NETWORK_MESSAGE = "Sem ligação ao servidor. Verifique a internet e tente novamente.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
      if (req.idempotencyKey) {
        headers["Idempotency-Key"] = req.idempotencyKey;
      }
      if (req.pin) {
        headers["X-Pin"] = req.pin;
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

  // Num pedido com falha de rede (ou tempo esgotado) o resultado é incerto: quem repetir
  // uma operação financeira deve reutilizar a MESMA chave de idempotência.
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
      const body = isRecord(json) ? json : {};
      const code = typeof body.error === "string" ? body.error : "http_error";
      const message =
        typeof body.message === "string" ? body.message : `Erro do servidor (${response.status}).`;
      const details: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (key !== "error" && key !== "message") {
          details[key] = value;
        }
      }
      throw new ApiError(response.status, code, message, details);
    }

    return json as T;
  }

  return { request };
}
