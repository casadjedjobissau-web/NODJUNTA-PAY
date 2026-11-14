import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { SUPPORT_CATEGORIES, SupportError, type SupportService } from "./support.types.js";

const createBody = z
  .object({
    category: z.enum(SUPPORT_CATEGORIES),
    subject: z.string().trim().min(3).max(120),
    message: z.string().trim().min(5).max(2000),
  })
  .strict();

const replyBody = z.object({ message: z.string().trim().min(1).max(2000) }).strict();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.coerce.number().int().positive().optional(),
});

const idParams = z.object({ id: z.string().uuid() });

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function sendSupportError(err: unknown, reply: FastifyReply) {
  if (err instanceof SupportError) {
    return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
  }
  throw err;
}

export function registerSupportRoutes(scope: FastifyInstance, support: SupportService): void {
  scope.get("/support/tickets", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const query = listQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describeIssues(query.error) });
    }
    const options =
      query.data.before === undefined
        ? { limit: query.data.limit }
        : { limit: query.data.limit, before: query.data.before };
    return support.list(user.id, options);
  });

  scope.post(
    "/support/tickets",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const body = createBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
      }
      try {
        const ticket = await support.createTicket(user.id, body.data);
        return reply.status(201).send(ticket);
      } catch (err) {
        return sendSupportError(err, reply);
      }
    },
  );

  scope.get("/support/tickets/:id", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
    }
    try {
      return await support.get(user.id, params.data.id);
    } catch (err) {
      return sendSupportError(err, reply);
    }
  });

  scope.post(
    "/support/tickets/:id/messages",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const params = idParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      const body = replyBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
      }
      try {
        const ticket = await support.reply(user.id, params.data.id, body.data.message);
        return reply.status(201).send(ticket);
      } catch (err) {
        return sendSupportError(err, reply);
      }
    },
  );

  scope.post("/support/tickets/:id/close", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
    }
    try {
      return await support.close(user.id, params.data.id);
    } catch (err) {
      return sendSupportError(err, reply);
    }
  });
}
