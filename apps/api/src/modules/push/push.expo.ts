import type { PushMessage, PushSender, PushTicket } from "./push.types.js";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_BATCH = 100;

export function isExpoPushToken(value: string): boolean {
  return /^(Exponent|Expo)PushToken\[[^\]\s]+\]$/.test(value);
}

export interface ExpoSenderOptions {
  accessToken?: string;
  fetchFn?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}

function toTicket(raw: unknown): PushTicket {
  const body = (raw ?? {}) as { status?: unknown; details?: { error?: unknown } };
  if (body.status === "ok") {
    return { status: "ok" };
  }
  const code = body.details?.error;
  return { status: "error", error: typeof code === "string" ? code : "unknown" };
}

export function createExpoPushSender(options: ExpoSenderOptions = {}): PushSender {
  const fetchFn = options.fetchFn ?? fetch;
  const endpoint = options.endpoint ?? EXPO_PUSH_URL;
  const timeoutMs = options.timeoutMs ?? 15000;

  async function sendBatch(batch: PushMessage[]): Promise<PushTicket[]> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(
          batch.map((message) => ({
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: "default",
          })),
        ),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`O serviço Expo Push respondeu ${response.status}`);
      }
      const json = (await response.json()) as { data?: unknown };
      if (!Array.isArray(json.data) || json.data.length !== batch.length) {
        throw new Error("Resposta inesperada do serviço Expo Push");
      }
      return json.data.map(toTicket);
    } finally {
      clearTimeout(timer);
    }
  }

  async function send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let start = 0; start < messages.length; start += EXPO_BATCH) {
      tickets.push(...(await sendBatch(messages.slice(start, start + EXPO_BATCH))));
    }
    return tickets;
  }

  return { send };
}
