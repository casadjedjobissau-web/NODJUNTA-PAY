import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createWebhookService } from "./webhooks.service.js";
import type { WebhookEvent } from "./webhooks.types.js";

const EVENT: WebhookEvent = {
  id: "evt-00000001",
  type: "deposit.completed",
  providerRef: "ref-1",
  data: { a: 1 },
};

function makeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push({ fn, params });
      return result;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("createWebhookService", () => {
  it("chama process_webhook_event com os parâmetros certos e devolve o resultado", async () => {
    const { client, calls } = makeClient({ data: "processed", error: null });
    const service = createWebhookService(client);

    expect(await service.handle("sandbox", EVENT)).toBe("processed");
    expect(calls).toEqual([
      {
        fn: "process_webhook_event",
        params: {
          p_provider: "sandbox",
          p_event_id: "evt-00000001",
          p_event_type: "deposit.completed",
          p_provider_ref: "ref-1",
          p_payload: { a: 1 },
        },
      },
    ]);
  });

  it("propaga erros da base de dados (o provedor volta a tentar)", async () => {
    const { client } = makeClient({ data: null, error: { message: "base de dados em baixo" } });
    const service = createWebhookService(client);

    await expect(service.handle("sandbox", EVENT)).rejects.toThrow("base de dados em baixo");
  });

  it("falha com respostas inesperadas", async () => {
    const { client } = makeClient({ data: "talvez", error: null });
    const service = createWebhookService(client);

    await expect(service.handle("sandbox", EVENT)).rejects.toThrow("Resposta inesperada");
  });
});
