import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createAdminGuard } from "../../plugins/admin-auth.js";
import type { AdminService } from "../admin/admin.types.js";
import type { SupportAdminService } from "./support.admin.types.js";
import { SUPPORT_STATUSES, SupportError } from "./support.types.js";

const listQuery = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const idParams = z.object({ id: z.string().uuid() });

const replyBody = z
  .object({
    message: z.string().trim().min(1).max(2000),
    resolve: z.boolean().default(false),
  })
  .strict();

const statusBody = z.object({ status: z.enum(["open", "resolved", "closed"]) }).strict();

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function actorId(request: FastifyRequest): string {
  const user = request.authUser;
  if (!user) {
    throw new Error("Pedido de administração sem utilizador autenticado");
  }
  return user.id;
}

async function run<T>(reply: FastifyReply, action: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof SupportError) {
      return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
    }
    throw err;
  }
}

export function registerSupportAdminRoutes(
  scope: FastifyInstance,
  admin: AdminService,
  support: SupportAdminService,
): void {
  const guard = createAdminGuard(admin);

  scope.get("/support/tickets", { preHandler: guard("support:read") }, async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describeIssues(query.error) });
    }
    return { items: await support.list(query.data.status ?? null, query.data.limit) };
  });

  scope.get(
    "/support/tickets/:id",
    { preHandler: guard("support:read"), config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      return run(reply, () => support.get(actorId(request), params.data.id, request.ip));
    },
  );

  scope.post(
    "/support/tickets/:id/reply",
    { preHandler: guard("support:reply") },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      const body = replyBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
      }
      return run(reply, async () => {
        await support.reply(actorId(request), params.data.id, body.data.message, body.data.resolve);
        return { ok: true };
      });
    },
  );

  scope.post(
    "/support/tickets/:id/status",
    { preHandler: guard("support:reply") },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      const body = statusBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
      }
      return run(reply, async () => ({
        status: await support.setStatus(actorId(request), params.data.id, body.data.status),
      }));
    },
  );
}
