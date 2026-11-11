import type { FastifyInstance } from "fastify";
import type { AuditService } from "./audit.types.js";

/**
 * Regista em auditoria todas as operações de escrita autenticadas que terminaram com sucesso.
 * Nunca guarda corpo do pedido nem cabeçalhos (evita segredos nos registos).
 * Falhas de auditoria são registadas no log mas não quebram a resposta ao cliente.
 */
export function registerAuditHook(scope: FastifyInstance, audit: AuditService): void {
  scope.addHook("onResponse", async (request, reply) => {
    const user = request.authUser;
    if (!user || request.method === "GET" || reply.statusCode >= 400) {
      return;
    }
    try {
      await audit.record({
        actorId: user.id,
        actorType: "user",
        action: `${request.method} ${request.routeOptions.url ?? request.url}`,
        entityType: null,
        entityId: null,
        ip: request.ip,
        metadata: { status: reply.statusCode },
      });
    } catch (err) {
      request.log.error({ err }, "falha ao registar auditoria");
    }
  });
}
