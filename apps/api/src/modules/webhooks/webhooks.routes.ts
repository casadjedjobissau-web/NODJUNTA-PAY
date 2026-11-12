import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifySignature } from "../../lib/webhook-signature.js";
import type { WebhookService } from "./webhooks.types.js";

const eventSchema = z.object({
  id: z.string().min(8).max(128),
  type: z.enum(["deposit.completed", "deposit.failed", "withdrawal.completed", "withdrawal.failed"]),
  providerRef: z.string().min(1).max(200),
  data: z.record(z.unknown()).default({}),
});

export interface WebhookRouteOptions {
  secrets: Record<string, string>;
  now?: () => number;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function registerWebhookRoutes(
  scope: FastifyInstance,
  webhooks: WebhookService,
  options: WebhookRouteOptions,
): void {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  scope.post(
    "/:provider",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { provider } = request.params as { provider: string };
      const secret = Object.prototype.hasOwnProperty.call(options.secrets, provider)
        ? options.secrets[provider]
        : undefined;
      if (!secret) {
        return reply.status(404).send({ error: "not_found", message: "Recurso não encontrado." });
      }

      const rawBody = request.body;
      if (!Buffer.isBuffer(rawBody)) {
        return reply.status(400).send({ error: "invalid_body", message: "Corpo inválido." });
      }

      const valid = verifySignature({
        secret,
        timestampHeader: singleHeader(request.headers["x-webhook-timestamp"]),
        signatureHeader: singleHeader(request.headers["x-webhook-signature"]),
        rawBody,
        nowSeconds: now(),
      });
      if (!valid) {
        return reply.status(401).send({ error: "invalid_signature", message: "Assinatura inválida." });
      }

      let json: unknown;
      try {
        json = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return reply.status(400).send({ error: "invalid_body", message: "JSON inválido." });
      }

      const parsed = eventSchema.safeParse(json);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_event",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }

      const status = await webhooks.handle(provider, parsed.data);
      return reply.status(200).send({ status });
    },
  );
}
