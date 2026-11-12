import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { permissionsOf } from "../../lib/admin-permissions.js";
import { createAdminGuard } from "../../plugins/admin-auth.js";
import { AdminError, type AdminService } from "./admin.types.js";

const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

const kycListQuery = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  limit: limitSchema,
});

const merchantListQuery = z.object({
  status: z.enum(["pending", "active", "suspended"]).optional(),
  limit: limitSchema,
});

const lookupQuery = z.object({
  // O "+" num URL sem codificação chega como espaço; aceitamos as duas formas.
  phone: z
    .string()
    .trim()
    .regex(/^\+?245[0-9]{9}$/, "phone deve ser +245 seguido de 9 dígitos")
    .transform((value) => (value.startsWith("+") ? value : `+${value}`)),
});

const auditQuery = z.object({
  limit: limitSchema,
  before: z.coerce.number().int().positive().optional(),
});

const uuidParams = z.object({ id: z.string().uuid() });
const merchantParams = z.object({ code: z.string().regex(/^[0-9A-F]{8}$/) });

const reviewBody = z
  .object({
    approve: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.approve || (value.reason !== undefined && value.reason.length > 0), {
    message: "A recusa exige um motivo",
    path: ["reason"],
  });

const merchantStatusBody = z.object({ status: z.enum(["active", "suspended"]) }).strict();

const freezeBody = z
  .object({
    frozen: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => !value.frozen || (value.reason !== undefined && value.reason.length > 0), {
    message: "O congelamento exige um motivo",
    path: ["reason"],
  });

function describe(error: z.ZodError): string {
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
    if (err instanceof AdminError) {
      return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
    }
    throw err;
  }
}

export function registerAdminRoutes(scope: FastifyInstance, admin: AdminService): void {
  const guard = createAdminGuard(admin);

  scope.get("/me", { preHandler: guard("overview:read") }, async (request) => {
    const role = request.adminRole;
    return {
      userId: actorId(request),
      role,
      permissions: role ? permissionsOf(role) : [],
    };
  });

  scope.get("/overview", { preHandler: guard("overview:read") }, async () => admin.overview());

  scope.get("/kyc/submissions", { preHandler: guard("kyc:read") }, async (request, reply) => {
    const query = kycListQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describe(query.error) });
    }
    return { items: await admin.listKyc(query.data.status, query.data.limit) };
  });

  scope.get(
    "/kyc/submissions/:id/documents",
    { preHandler: guard("kyc:read"), config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = uuidParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      return run(reply, async () => ({
        documents: await admin.kycDocuments(actorId(request), params.data.id, request.ip),
      }));
    },
  );

  scope.post("/kyc/submissions/:id/review", { preHandler: guard("kyc:review") }, async (request, reply) => {
    const params = uuidParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
    }
    const body = reviewBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", message: describe(body.error) });
    }
    return run(reply, async () => ({
      status: await admin.reviewKyc(
        actorId(request),
        params.data.id,
        body.data.approve,
        body.data.reason ?? null,
      ),
    }));
  });

  scope.get("/merchants", { preHandler: guard("merchant:read") }, async (request, reply) => {
    const query = merchantListQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describe(query.error) });
    }
    return { items: await admin.listMerchants(query.data.status ?? null, query.data.limit) };
  });

  scope.post("/merchants/:code/status", { preHandler: guard("merchant:manage") }, async (request, reply) => {
    const params = merchantParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "Código inválido." });
    }
    const body = merchantStatusBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", message: describe(body.error) });
    }
    return run(reply, async () => ({
      status: await admin.setMerchantStatus(actorId(request), params.data.code, body.data.status),
    }));
  });

  scope.get(
    "/users/lookup",
    { preHandler: guard("user:read"), config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const query = lookupQuery.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: "invalid_query", message: describe(query.error) });
      }
      return run(reply, async () => {
        const user = await admin.lookupUser(actorId(request), query.data.phone, request.ip);
        if (!user) {
          return reply.status(404).send({ error: "user_not_found", message: "Utilizador não encontrado." });
        }
        return user;
      });
    },
  );

  scope.post("/users/:id/freeze", { preHandler: guard("account:freeze") }, async (request, reply) => {
    const params = uuidParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
    }
    const body = freezeBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", message: describe(body.error) });
    }
    return run(reply, async () => ({
      status: await admin.setWalletFrozen(
        actorId(request),
        params.data.id,
        body.data.frozen,
        body.data.reason ?? null,
      ),
    }));
  });

  scope.get("/audit", { preHandler: guard("audit:read") }, async (request, reply) => {
    const query = auditQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describe(query.error) });
    }
    return admin.listAudit(query.data.limit, query.data.before);
  });
}
