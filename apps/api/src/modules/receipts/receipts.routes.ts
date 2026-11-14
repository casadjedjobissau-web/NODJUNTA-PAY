import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ReceiptError, type ReceiptService } from "./receipts.types.js";

const params = z.object({ transactionId: z.string().uuid() });

export function registerReceiptRoutes(scope: FastifyInstance, receipts: ReceiptService): void {
  scope.get(
    "/receipts/:transactionId",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const parsed = params.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      try {
        return await receipts.get(user.id, parsed.data.transactionId);
      } catch (err) {
        if (err instanceof ReceiptError) {
          return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );
}
