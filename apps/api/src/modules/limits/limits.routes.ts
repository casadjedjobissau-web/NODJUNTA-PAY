import type { FastifyInstance } from "fastify";
import type { LimitsService } from "./limits.types.js";

export function registerLimitsRoutes(scope: FastifyInstance, limits: LimitsService): void {
  scope.get("/limits", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    return limits.getLimits(user.id);
  });
}
