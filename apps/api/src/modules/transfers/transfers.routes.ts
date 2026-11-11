import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TransferError, type TransferService } from "./transfers.types.js";

const bodySchema = z
  .object({
    toPhone: z.string().regex(/^\+245[0-9]{9}$/, "toPhone deve ser +245 seguido de 9 dígitos"),
    amount: z.number().int().positive().max(1_000_000_000),
    reference: z.string().trim().min(1).max(140).optional(),
  })
  .strict();

const keySchema = z.string().min(8).max(128);

export function registerTransferRoutes(scope: FastifyInstance, transfers: TransferService): void {
  scope.post(
    "/transfers",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }

      const rawKey = request.headers["idempotency-key"];
      const key = keySchema.safeParse(Array.isArray(rawKey) ? rawKey[0] : rawKey);
      if (!key.success) {
        return reply.status(400).send({
          error: "invalid_idempotency_key",
          message: "Cabeçalho Idempotency-Key obrigatório (8 a 128 caracteres).",
        });
      }

      const body = bodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }

      try {
        const result = await transfers.createTransfer({
          fromUserId: user.id,
          toPhone: body.data.toPhone,
          amount: body.data.amount,
          idempotencyKey: key.data,
          reference: body.data.reference ?? null,
        });
        return reply.status(result.replayed ? 200 : 201).send(result);
      } catch (err) {
        if (err instanceof TransferError) {
          return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );
}
