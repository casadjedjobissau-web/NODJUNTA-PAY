import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { KycError, type KycService } from "./kyc.types.js";

const createSchema = z
  .object({
    targetLevel: z.number().int().min(1).max(3),
    documentType: z.enum(["id_card", "passport", "other"]),
  })
  .strict();

const uploadSchema = z
  .object({
    kinds: z.array(z.enum(["front", "back", "selfie"])).min(1).max(3),
  })
  .strict()
  .refine((value) => new Set(value.kinds).size === value.kinds.length, {
    message: "kinds não pode ter valores repetidos",
  });

const idParams = z.object({ id: z.string().uuid() });

function sendKycError(err: unknown, reply: FastifyReply) {
  if (err instanceof KycError) {
    return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
  }
  throw err;
}

export function registerKycRoutes(scope: FastifyInstance, kyc: KycService): void {
  scope.get("/kyc", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    return kyc.getStatus(user.id);
  });

  scope.post(
    "/kyc/submissions",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const body = createSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }
      try {
        const submission = await kyc.createSubmission(
          user.id,
          body.data.targetLevel,
          body.data.documentType,
        );
        return reply.status(201).send(submission);
      } catch (err) {
        return sendKycError(err, reply);
      }
    },
  );

  scope.post(
    "/kyc/submissions/:id/upload-urls",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const params = idParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      const body = uploadSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }
      try {
        const targets = await kyc.createUploadTargets(user.id, params.data.id, body.data.kinds);
        return { targets };
      } catch (err) {
        return sendKycError(err, reply);
      }
    },
  );

  scope.post(
    "/kyc/submissions/:id/submit",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }
      const params = idParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "invalid_params", message: "Identificador inválido." });
      }
      try {
        return await kyc.submit(user.id, params.data.id);
      } catch (err) {
        return sendKycError(err, reply);
      }
    },
  );
}
