export type WebhookEventType =
  | "deposit.completed"
  | "deposit.failed"
  | "withdrawal.completed"
  | "withdrawal.failed";

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  providerRef: string;
  data: Record<string, unknown>;
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored" | "failed";

export interface WebhookService {
  handle(provider: string, event: WebhookEvent): Promise<WebhookOutcome>;
}
