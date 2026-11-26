import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDeps } from "./app.js";
import type { Env } from "./config/env.js";
import { createSupabaseAdmin, createSupabaseAuthenticator } from "./lib/supabase.js";
import { createAccountService } from "./modules/account/account.service.js";
import { createAdminService } from "./modules/admin/admin.service.js";
import { createAuditService } from "./modules/audit/audit.service.js";
import { createDeviceService } from "./modules/devices/devices.service.js";
import { createFraudAdminService } from "./modules/fraud/fraud.admin.service.js";
import { createFraudService } from "./modules/fraud/fraud.service.js";
import { createSandboxProvider } from "./modules/funding/funding.provider.sandbox.js";
import { createFundingService } from "./modules/funding/funding.service.js";
import type { FundingProvider } from "./modules/funding/funding.types.js";
import { createKycService } from "./modules/kyc/kyc.service.js";
import { createLimitsService } from "./modules/limits/limits.service.js";
import { createMerchantService } from "./modules/merchants/merchants.service.js";
import { createNotificationService } from "./modules/notifications/notifications.service.js";
import { createPaymentService } from "./modules/payments/payments.service.js";
import { createPhoneChangeService } from "./modules/phone-change/phone-change.service.js";
import { createPinService } from "./modules/pin/pin.service.js";
import { createProfileService } from "./modules/profile/profile.service.js";
import { createReceiptService } from "./modules/receipts/receipts.service.js";
import { createReportService } from "./modules/reports/reports.service.js";
import { createSupportAdminService } from "./modules/support/support.admin.service.js";
import { createSupportService } from "./modules/support/support.service.js";
import { createTransferService } from "./modules/transfers/transfers.service.js";
import { createWalletService } from "./modules/wallet/wallet.service.js";
import { createWebhookService } from "./modules/webhooks/webhooks.service.js";

export function pickFundingProvider(env: Env): FundingProvider {
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

export function pickWebhookSecrets(env: Env): Record<string, string> {
  return env.WEBHOOK_SECRET_SANDBOX ? { sandbox: env.WEBHOOK_SECRET_SANDBOX } : {};
}

// A única ligação de serviços da API. O servidor e o teste de ponta a ponta usam esta mesma função.
export function buildDeps(env: Env, supabase: SupabaseClient = createSupabaseAdmin(env)): AppDeps {
  const audit = createAuditService(supabase);

  return {
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
    adminMfaRequired: env.ADMIN_MFA,
    pin: createPinService(supabase, { pepper: env.PIN_PEPPER }),
    pinEnforced: env.PIN_ENFORCEMENT,
    supportPhones: env.SUPPORT_PHONES,
    notifications: createNotificationService(supabase),
    receipts: createReceiptService(supabase),
    support: createSupportService(supabase),
    supportAdmin: createSupportAdminService(supabase, audit),
    reports: createReportService(supabase, audit, env.DEFAULT_CURRENCY),
    account: createAccountService(supabase),
    phoneChange: createPhoneChangeService(supabase),
    fraud: createFraudService(supabase),
    fraudAdmin: createFraudAdminService(supabase),
  };
}
