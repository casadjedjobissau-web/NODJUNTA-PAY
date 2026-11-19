import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createAdminGuard } from "../../plugins/admin-auth.js";
import type { AdminService } from "../admin/admin.types.js";
import { FRAUD_ALERT_STATUSES, FraudError, type FraudAdminService } from "./fraud.types.js";

const listQuery = z.object({
  status: z.enum(FRAUD_ALERT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const idParams = z.object({ id: z.string().uuid() });

const reviewBody = z.object({ note: z.string().trim().max(300).optional() }).strict();

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
    if (err instanceof FraudError) {
      return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
    }
    throw err;
  }
}

export function registerFraudAdminRoutes(
  scope: FastifyInstance,
  admin: AdminService,
  fraud: FraudAdminService,
): void {
  const guard = createAdminGuard(admin);

  scope.get("/fraud/alerts", { preHandler: guard("fraud:review") }, async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describeIssues(query.error) });
    }
    return run(reply, async () => ({ items: await fraud.list(query.data.status ?? null, query.data.limit) }));
  });

  scope.post("/fraud/alerts/:id/review", { preHandler: guard("fraud:review") }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
    }
    const body = reviewBody.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
    }
    return run(reply, async () => ({
      status: await fraud.review(actorId(request), params.data.id, body.data.note ?? null),
    }));
  });
}
