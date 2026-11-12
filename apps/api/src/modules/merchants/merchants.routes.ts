import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildQrPayload } from "./qr.js";
import type { MerchantService } from "./merchants.types.js";

const registerSchema = z
  .object({
    businessName: z.string().trim().min(2).max(120),
  })
  .strict();

export function registerMerchantRoutes(scope: FastifyInstance, merchants: MerchantService): void {
  scope.post(
    "/merchants",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }

      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_body",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }

      return merchants.register(user.id, parsed.data.businessName);
    },
  );

  scope.get("/merchants/me", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const merchant = await merchants.getByOwner(user.id);
    if (!merchant) {
      return reply
        .status(404)
        .send({ error: "merchant_not_found", message: "Ainda não é comerciante." });
    }
    return merchant;
  });

  scope.get("/merchants/me/qr", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    const merchant = await merchants.getByOwner(user.id);
    if (!merchant) {
      return reply
        .status(404)
        .send({ error: "merchant_not_found", message: "Ainda não é comerciante." });
    }
    if (merchant.status !== "active") {
      return reply.status(409).send({
        error: "merchant_not_active",
        message: "O comerciante ainda não foi aprovado.",
      });
    }
    return { merchantCode: merchant.merchantCode, payload: buildQrPayload(merchant.merchantCode) };
  });
}
