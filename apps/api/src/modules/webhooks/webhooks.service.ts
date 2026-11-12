import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent, WebhookOutcome, WebhookService } from "./webhooks.types.js";

const OUTCOMES: WebhookOutcome[] = ["processed", "duplicate", "ignored", "failed"];

export function createWebhookService(client: SupabaseClient): WebhookService {
  return {
    async handle(provider: string, event: WebhookEvent): Promise<WebhookOutcome> {
      const { data, error } = await client.rpc("process_webhook_event", {
        p_provider: provider,
        p_event_id: event.id,
        p_event_type: event.type,
        p_provider_ref: event.providerRef,
        p_payload: event.data,
      });
      if (error) {
        throw new Error(`Falha ao processar webhook: ${error.message}`);
      }
      const outcome = OUTCOMES.find((candidate) => candidate === data);
      if (!outcome) {
        throw new Error("Resposta inesperada de process_webhook_event");
      }
      return outcome;
    },
  };
}
