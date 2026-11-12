import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readIdempotencyKey } from "../../lib/idempotency.js";
import { PaymentError, type PaymentService } from "./payments.types.js";

const resolveSchema = z
  .object({
    payload: z.string().trim().min(1).max(64),
  })
  .strict();

const paySchema = z
  .object({
    merchantCode: z.string().regex(/^[0-9A-F]{8}$/, "merchantCode inválido"),
    amount: z.number().int().positive().max(1_000_000_000),
    reference: z.string().trim().min(1).max(140).optional(),
  })
  .strict();

export function registerPaymentRoutes(scope: FastifyInstance, payments: PaymentService): void {
  scope.post(
    "/payments/qr/resolve",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }

      const parsed = resolveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }

      const merchant = await payments.resolveQr(parsed.data.payload);
      if (!merchant) {
        return reply
          .status(404)
          .send({ error: "merchant_not_found", message: "QR Code inválido ou comerciante inativo." });
      }
      return merchant;
    },
  );

  scope.post(
    "/payments/merchant",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }

      const key = readIdempotencyKey(request.headers);
      if (!key) {
        return reply.status(400).send({
          error: "invalid_idempotency_key",
          message: "Cabeçalho Idempotency-Key obrigatório (8 a 128 caracteres).",
        });
      }

      const body = paySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }

      try {
        const result = await payments.payMerchant({
          fromUserId: user.id,
          merchantCode: body.data.merchantCode,
          amount: body.data.amount,
          idempotencyKey: key,
          reference: body.data.reference ?? null,
        });
        return reply.status(result.replayed ? 200 : 201).send(result);
      } catch (err) {
        if (err instanceof PaymentError) {
          return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );
}
