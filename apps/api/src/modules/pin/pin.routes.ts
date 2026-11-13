import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { isRecentSignIn } from "../../lib/recent-login.js";
import { PinError, describePinFailure, type PinService } from "./pin.types.js";

const pinSchema = z.string().regex(/^[0-9]{6}$/, "O PIN deve ter exatamente 6 dígitos.");

const setBody = z.object({ pin: pinSchema }).strict();
const changeBody = z.object({ currentPin: pinSchema, newPin: pinSchema }).strict();
const resetBody = z.object({ newPin: pinSchema }).strict();

const limit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function sendPinError(err: unknown, reply: FastifyReply) {
  if (err instanceof PinError) {
    return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
  }
  throw err;
}

export function registerPinRoutes(scope: FastifyInstance, pin: PinService): void {
  scope.get("/pin", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    return pin.status(user.id);
  });

  scope.post("/pin", limit, async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const body = setBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
    }
    try {
      await pin.setInitial(user.id, body.data.pin);
      return reply.status(201).send({ ok: true });
    } catch (err) {
      return sendPinError(err, reply);
    }
  });

  scope.post("/pin/change", limit, async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const body = changeBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
    }
    try {
      const result = await pin.change(user.id, body.data.currentPin, body.data.newPin);
      if (!result.ok) {
        const response = describePinFailure(result);
        return reply.status(response.httpStatus).send(response.body);
      }
      return { ok: true };
    } catch (err) {
      return sendPinError(err, reply);
    }
  });

  // Recuperar o PIN exige ter entrado com o código SMS há poucos minutos.
  scope.post("/pin/reset", limit, async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    if (!isRecentSignIn(user.lastSignInAt, new Date())) {
      return reply.status(403).send({
        error: "recent_login_required",
        message: "Por segurança, termine a sessão, volte a entrar com o código SMS e tente novamente.",
      });
    }
    const body = resetBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", message: describeIssues(body.error) });
    }
    try {
      await pin.reset(user.id, body.data.newPin);
      return { ok: true };
    } catch (err) {
      return sendPinError(err, reply);
    }
  });
}
