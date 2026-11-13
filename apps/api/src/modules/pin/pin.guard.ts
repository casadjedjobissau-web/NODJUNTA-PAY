import type { FastifyReply, FastifyRequest } from "fastify";
import { isValidPinFormat } from "../../lib/pin-policy.js";
import type { AuditService } from "../audit/audit.types.js";
import { describePinFailure, type PinService } from "./pin.types.js";

export const PIN_PROTECTED: ReadonlySet<string> = new Set([
  "POST /v1/transfers",
  "POST /v1/payments/merchant",
  "POST /v1/withdrawals",
]);

export function createPinGuard(pin: PinService, audit?: AuditService) {
  return async function pinGuard(request: FastifyRequest, reply: FastifyReply) {
    const route = request.routeOptions.url ?? request.url;
    if (!PIN_PROTECTED.has(`${request.method} ${route}`)) {
      return;
    }

    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }

    const raw = request.headers["x-pin"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) {
      return reply
        .status(400)
        .send({ error: "pin_required", message: "Introduza o PIN para confirmar a operação." });
    }
    if (!isValidPinFormat(value)) {
      return reply
        .status(400)
        .send({ error: "invalid_pin_format", message: "O PIN deve ter exatamente 6 dígitos." });
    }

    const result = await pin.verify(user.id, value);
    if (result.ok) {
      return;
    }

    if (result.reason === "invalid" && result.attemptsLeft <= 0 && result.lockedUntil !== null && audit) {
      try {
        await audit.record({
          actorId: user.id,
          actorType: "user",
          action: "PIN_LOCKED",
          entityType: "user",
          entityId: user.id,
          ip: request.ip,
          metadata: { route },
        });
      } catch (err) {
        request.log.error({ err }, "falha ao registar bloqueio de PIN");
      }
    }

    const response = describePinFailure(result);
    return reply.status(response.httpStatus).send(response.body);
  };
}
