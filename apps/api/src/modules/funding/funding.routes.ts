import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readIdempotencyKey } from "../../lib/idempotency.js";
import { FundingError, type FundingService } from "./funding.types.js";

const amountSchema = z.number().int().positive().max(1_000_000_000);

const depositSchema = z.object({ amount: amountSchema }).strict();

const withdrawalSchema = z
  .object({
    amount: amountSchema,
    destination: z.string().regex(/^\+[0-9]{8,15}$/, "destination deve estar no formato internacional (+...)"),
  })
  .strict();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const sandboxParams = z.object({
  id: z.string().uuid(),
  outcome: z.enum(["complete", "fail"]),
});

export interface FundingRouteOptions {
  sandboxEnabled: boolean;
}

export function registerFundingRoutes(
  scope: FastifyInstance,
  funding: FundingService,
  options: FundingRouteOptions,
): void {
  scope.post(
    "/deposits",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const key = readIdempotencyKey(request.headers);
      if (!key) {
        return reply.status(400).send({
          error: "invalid_idempotency_key",
          message: "Cabeçalho Idempotency-Key obrigatório (8 a 128 caracteres).",
        });
      }
      const body = depositSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }
      try {
        const result = await funding.createDeposit(user.id, body.data.amount, key);
        return reply.status(result.replayed ? 200 : 201).send(result);
      } catch (err) {
        if (err instanceof FundingError) {
          return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );

  scope.post(
    "/withdrawals",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const key = readIdempotencyKey(request.headers);
      if (!key) {
        return reply.status(400).send({
          error: "invalid_idempotency_key",
          message: "Cabeçalho Idempotency-Key obrigatório (8 a 128 caracteres).",
        });
      }
      const body = withdrawalSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }
      try {
        const result = await funding.createWithdrawal(
          user.id,
          body.data.amount,
          body.data.destination,
          key,
        );
        return reply.status(result.replayed ? 200 : 201).send(result);
      } catch (err) {
        if (err instanceof FundingError) {
          return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );

  scope.get("/funding-requests", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const query = listQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: "invalid_query",
        message: query.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
    const items = await funding.list(user.id, query.data.limit);
    return { items };
  });

  if (options.sandboxEnabled) {
    scope.post("/sandbox/funding-requests/:id/:outcome", async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const params = sandboxParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Parâmetros inválidos." });
      }
      try {
        return await funding.sandboxSettle(user.id, params.data.id, params.data.outcome);
      } catch (err) {
        if (err instanceof FundingError) {
          return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    });
  }
}
