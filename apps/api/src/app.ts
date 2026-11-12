import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Env } from "./config/env.js";
import { createAuthHook, type Authenticator } from "./plugins/auth.js";
import { registerWalletRoutes } from "./modules/wallet/wallet.routes.js";
import type { WalletService } from "./modules/wallet/wallet.types.js";
import { registerTransferRoutes } from "./modules/transfers/transfers.routes.js";
import type { TransferService } from "./modules/transfers/transfers.types.js";
import { registerProfileRoutes } from "./modules/profile/profile.routes.js";
import type { ProfileService } from "./modules/profile/profile.types.js";
import { registerDeviceRoutes } from "./modules/devices/devices.routes.js";
import type { DeviceService } from "./modules/devices/devices.types.js";
import { registerAuditHook } from "./modules/audit/audit.hook.js";
import type { AuditService } from "./modules/audit/audit.types.js";
import { registerMerchantRoutes } from "./modules/merchants/merchants.routes.js";
import type { MerchantService } from "./modules/merchants/merchants.types.js";
import { registerPaymentRoutes } from "./modules/payments/payments.routes.js";
import type { PaymentService } from "./modules/payments/payments.types.js";
import { registerFundingRoutes } from "./modules/funding/funding.routes.js";
import type { FundingService } from "./modules/funding/funding.types.js";
import { registerLimitsRoutes } from "./modules/limits/limits.routes.js";
import type { LimitsService } from "./modules/limits/limits.types.js";
import { registerKycRoutes } from "./modules/kyc/kyc.routes.js";
import type { KycService } from "./modules/kyc/kyc.types.js";

export interface AppDeps {
  authenticator: Authenticator;
  wallet: WalletService;
  transfers: TransferService;
  profile: ProfileService;
  devices: DeviceService;
  audit: AuditService;
  merchants: MerchantService;
  payments: PaymentService;
  funding: FundingService;
  limits: LimitsService;
  kyc: KycService;
}

export async function buildApp(env: Env, deps: AppDeps) {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                'req.headers["x-api-key"]',
                'req.headers["x-webhook-signature"]',
              ],
              censor: "[REDACTED]",
            },
          },
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "erro interno");
      return reply.status(500).send({ error: "internal_error", message: "Erro interno do servidor." });
    }
    return reply.status(statusCode).send({ error: "request_error", message: error.message });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: "not_found", message: "Recurso não encontrado." }),
  );

  app.get("/health", async () => ({
    status: "ok",
    service: "nodjunta-pay-api",
    currency: env.DEFAULT_CURRENCY,
    time: new Date().toISOString(),
  }));

  app.decorateRequest("authUser", null);
  const requireAuth = createAuthHook(deps.authenticator);

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireAuth);
      registerAuditHook(scope, deps.audit);
      registerWalletRoutes(scope, deps.wallet);
      registerTransferRoutes(scope, deps.transfers);
      registerProfileRoutes(scope, deps.profile);
      registerDeviceRoutes(scope, deps.devices);
      registerMerchantRoutes(scope, deps.merchants);
      registerPaymentRoutes(scope, deps.payments);
      registerFundingRoutes(scope, deps.funding, { sandboxEnabled: env.SANDBOX_ENABLED });
      registerLimitsRoutes(scope, deps.limits);
      registerKycRoutes(scope, deps.kyc);
    },
    { prefix: "/v1" },
  );

  return app;
}
