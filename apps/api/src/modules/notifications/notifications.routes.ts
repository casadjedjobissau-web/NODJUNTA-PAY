import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotificationError, type NotificationService } from "./notifications.types.js";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.coerce.number().int().positive().optional(),
});

const idParams = z.object({ id: z.string().uuid() });

export function registerNotificationRoutes(scope: FastifyInstance, notifications: NotificationService): void {
  scope.get("/notifications", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const query = listQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: "invalid_query",
        message: query.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      });
    }
    const options =
      query.data.before === undefined
        ? { limit: query.data.limit }
        : { limit: query.data.limit, before: query.data.before };
    return notifications.list(user.id, options);
  });

  scope.post("/notifications/read-all", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    return { updated: await notifications.markAllRead(user.id) };
  });

  scope.post("/notifications/:id/read", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
    }
    try {
      await notifications.markRead(user.id, params.data.id);
      return { ok: true };
    } catch (err) {
      if (err instanceof NotificationError) {
        return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
}
