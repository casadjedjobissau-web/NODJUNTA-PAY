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

  const app = await buildApp(env, {
    authenticator: createSupabaseAuthenticator(supabase),
    wallet: createWalletService(supabase, env.DEFAULT_CURRENCY),
    transfers: createTransferService(supabase, env.DEFAULT_CURRENCY),
    profile: createProfileService(supabase),
    devices: createDeviceService(supabase),
    audit: createAuditService(supabase),
    merchants: createMerchantService(supabase, env.DEFAULT_CURRENCY),
    payments: createPaymentService(supabase, env.DEFAULT_CURRENCY),
    funding: createFundingService(supabase, env.DEFAULT_CURRENCY, pickFundingProvider(env)),
    limits: createLimitsService(supabase, env.DEFAULT_CURRENCY),
    kyc: createKycService(supabase),
    webhooks: createWebhookService(supabase),
    webhookSecrets: pickWebhookSecrets(env),
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "a encerrar");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
