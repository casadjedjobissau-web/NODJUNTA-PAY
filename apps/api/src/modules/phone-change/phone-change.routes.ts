import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createAdminGuard } from "../../plugins/admin-auth.js";
import type { AdminService } from "../admin/admin.types.js";
import { PHONE_CHANGE_STATUSES, PhoneChangeError, type PhoneChangeService } from "./phone-change.types.js";

const listQuery = z.object({
  status: z.enum(PHONE_CHANGE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const createBody = z
  .object({
    userId: z.string().uuid(),
    newPhone: z.string().regex(/^\+245[0-9]{9}$/, "newPhone deve ser +245 seguido de 9 dígitos"),
    reason: z.string().trim().min(3).max(300),
    evidence: z.string().trim().min(10).max(500),
  })
  .strict();

const idParams = z.object({ id: z.string().uuid() });

const decideBody = z
  .object({
    approve: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.approve || (value.reason !== undefined && value.reason.length > 0), {
    message: "A recusa exige um motivo",
    path: ["reason"],
  });

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
    if (err instanceof PhoneChangeError) {
      return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
    }
    throw err;
  }
}

export function registerPhoneChangeRoutes(
  scope: FastifyInstance,
  admin: AdminService,
  phoneChange: PhoneChangeService,
): void {
  const guard = createAdminGuard(admin);

  scope.get("/phone-changes", { preHandler: guard("phone_change:request") }, async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describeIssues(query.error) });
    }
    return run(reply, async () => ({
      items: await phoneChange.list(query.data.status ?? null, query.data.limit),
    }));
  });

  scope.post(
    "/phone-changes",
    { preHandler: guard("phone_change:request"), config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = createBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
      }
      return run(reply, async () => {
        const created = await phoneChange.create(actorId(request), body.data);
        return reply.status(201).send(created);
      });
    },
  );

  scope.post(
    "/phone-changes/:id/decide",
    { preHandler: guard("phone_change:approve"), config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      const body = decideBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
      }
      return run(reply, async () => ({
        status: await phoneChange.decide(
          actorId(request),
          params.data.id,
          body.data.approve,
          body.data.reason ?? null,
        ),
      }));
    },
  );
}
