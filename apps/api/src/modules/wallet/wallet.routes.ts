import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WalletService } from "./wallet.types.js";

const statementQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.coerce.number().int().positive().optional(),
});

export function registerWalletRoutes(scope: FastifyInstance, wallet: WalletService): void {
  scope.get("/wallet", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const view = await wallet.getOrCreateWallet(user.id);
    return view;
  });

  scope.get("/wallet/statement", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }

    const parsed = statementQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_query",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }

    const options =
      parsed.data.before === undefined
        ? { limit: parsed.data.limit }
        : { limit: parsed.data.limit, before: parsed.data.before };

    return wallet.getStatement(user.id, options);
  });
}
