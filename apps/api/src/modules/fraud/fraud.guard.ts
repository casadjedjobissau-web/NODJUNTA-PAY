import type { FastifyReply, FastifyRequest } from "fastify";
import { describeFraudBlock, type FraudOperation, type FraudService } from "./fraud.types.js";

export const FRAUD_OPERATIONS_BY_ROUTE: Readonly<Record<string, FraudOperation>> = {
  "POST /v1/transfers": "transfer",
  "POST /v1/payments/merchant": "merchant_payment",
  "POST /v1/withdrawals": "withdrawal",
};

// Lê o valor do corpo ainda por validar. Se não for um inteiro positivo, devolve null:
// a rota vai recusar o pedido com a sua própria validação.
export function readAmount(body: unknown): number | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const amount = (body as { amount?: unknown }).amount;
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function createFraudGuard(fraud: FraudService) {
  return async function fraudGuard(request: FastifyRequest, reply: FastifyReply) {
    const route = request.routeOptions.url ?? request.url;
    const operation = Object.prototype.hasOwnProperty.call(FRAUD_OPERATIONS_BY_ROUTE, `${request.method} ${route}`)
      ? FRAUD_OPERATIONS_BY_ROUTE[`${request.method} ${route}`]
      : undefined;
    if (!operation) {
      return;
    }

    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }

    const amount = readAmount(request.body);
    if (amount === null) {
      return;
    }

    let result;
    try {
      result = await fraud.check(user.id, operation, amount);
    } catch (err) {
      // Falha fechada: sem avaliação, o dinheiro não mexe.
      request.log.error({ err }, "falha na verificação antifraude");
      return reply.status(503).send({
        error: "fraud_check_unavailable",
        message: "Não foi possível validar a operação neste momento. Tente novamente dentro de instantes.",
      });
    }

    if (result.decision === "block") {
      const response = describeFraudBlock(result.rule);
      return reply.status(response.httpStatus).send({ error: response.error, message: response.message });
    }
    if (result.decision === "flag") {
      request.log.warn({ rule: result.rule, operation }, "operação sinalizada pelo antifraude");
    }
  };
}
