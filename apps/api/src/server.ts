import "dotenv/config";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createSupabaseAdmin, createSupabaseAuthenticator } from "./lib/supabase.js";
import { createWalletService } from "./modules/wallet/wallet.service.js";
import { createTransferService } from "./modules/transfers/transfers.service.js";
import { createProfileService } from "./modules/profile/profile.service.js";
import { createDeviceService } from "./modules/devices/devices.service.js";
import { createAuditService } from "./modules/audit/audit.service.js";

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
