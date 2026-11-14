import "dotenv/config";
import { buildApp } from "./app.js";
import { loadEnv, type Env } from "./config/env.js";
import { createSupabaseAdmin, createSupabaseAuthenticator } from "./lib/supabase.js";
import { createWalletService } from "./modules/wallet/wallet.service.js";
import { createTransferService } from "./modules/transfers/transfers.service.js";
import { createProfileService } from "./modules/profile/profile.service.js";
import { createDeviceService } from "./modules/devices/devices.service.js";
import { createAuditService } from "./modules/audit/audit.service.js";
import { createMerchantService } from "./modules/merchants/merchants.service.js";
import { createPaymentService } from "./modules/payments/payments.service.js";
import { createFundingService } from "./modules/funding/funding.service.js";
import { createSandboxProvider } from "./modules/funding/funding.provider.sandbox.js";
import type { FundingProvider } from "./modules/funding/funding.types.js";
import { createLimitsService } from "./modules/limits/limits.service.js";
import { createKycService } from "./modules/kyc/kyc.service.js";
import { createWebhookService } from "./modules/webhooks/webhooks.service.js";
import { createAdminService } from "./modules/admin/admin.service.js";
import { createPinService } from "./modules/pin/pin.service.js";
import { createNotificationService } from "./modules/notifications/notifications.service.js";
import { createExpoPushSender } from "./modules/push/push.expo.js";
import { createPushDispatcher } from "./modules/push/push.dispatcher.js";
import { createPushLoop, type PushLoop } from "./modules/push/push.loop.js";

const PUSH_INTERVAL_MS = 10_000;

function pickFundingProvider(env: Env): FundingProvider {
  if (env.SANDBOX_ENABLED) {
    return createSandboxProvider();
  }
  // Ainda não existe provedor financeiro real integrado.
  return {
    name: "unconfigured",
    async initiateDeposit() {
      throw new Error("Nenhum provedor financeiro configurado");
    },
    async initiateWithdrawal() {
      throw new Error("Nenhum provedor financeiro configurado");
    },
  };
}

function pickWebhookSecrets(env: Env): Record<string, string> {
  return env.WEBHOOK_SECRET_SANDBOX ? { sandbox: env.WEBHOOK_SECRET_SANDBOX } : {};
}

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const supabase = createSupabaseAdmin(env);
  const audit = createAuditService(supabase);

  const app = await buildApp(env, {
    authenticator: createSupabaseAuthenticator(supabase),
    wallet: createWalletService(supabase, env.DEFAULT_CURRENCY),
    transfers: createTransferService(supabase, env.DEFAULT_CURRENCY),
    profile: createProfileService(supabase),
    devices: createDeviceService(supabase),
    audit,
    merchants: createMerchantService(supabase, env.DEFAULT_CURRENCY),
    payments: createPaymentService(supabase, env.DEFAULT_CURRENCY),
    funding: createFundingService(supabase, env.DEFAULT_CURRENCY, pickFundingProvider(env)),
    limits: createLimitsService(supabase, env.DEFAULT_CURRENCY),
    kyc: createKycService(supabase),
    webhooks: createWebhookService(supabase),
    webhookSecrets: pickWebhookSecrets(env),
    admin: createAdminService(supabase, audit),
    pin: createPinService(supabase, { pepper: env.PIN_PEPPER }),
    pinEnforced: env.PIN_ENFORCEMENT,
    supportPhones: env.SUPPORT_PHONES,
    notifications: createNotificationService(supabase),
  });

  if (!env.PIN_ENFORCEMENT) {
    app.log.warn("PIN_ENFORCEMENT=off: o PIN NÃO é exigido nas operações de dinheiro (só desenvolvimento)");
  }

  let pushLoop: PushLoop | null = null;
  if (env.PUSH_ENABLED) {
    const senderOptions = env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {};
    const dispatcher = createPushDispatcher(supabase, createExpoPushSender(senderOptions));
    pushLoop = createPushLoop(
      async () => {
        const result = await dispatcher.dispatchOnce();
        if (result.claimed > 0) {
          app.log.info(result, "notificações push processadas");
        }
      },
      PUSH_INTERVAL_MS,
      (error) => app.log.error({ err: error }, "falha no ciclo de notificações push"),
    );
  } else {
    app.log.warn("PUSH_ENABLED=false: as notificações push não serão enviadas");
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "a encerrar");
    if (pushLoop) {
      await pushLoop.stop();
    }
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.PORT, host: env.HOST });
  pushLoop?.start();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
