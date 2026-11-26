import "dotenv/config";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { buildDeps } from "./deps.js";
import { createSupabaseAdmin } from "./lib/supabase.js";
import { createExpoPushSender } from "./modules/push/push.expo.js";
import { createPushDispatcher } from "./modules/push/push.dispatcher.js";
import { createPushLoop, type PushLoop } from "./modules/push/push.loop.js";

const PUSH_INTERVAL_MS = 10_000;

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const supabase = createSupabaseAdmin(env);

  const app = await buildApp(env, buildDeps(env, supabase));

  if (!env.PIN_ENFORCEMENT) {
    app.log.warn("PIN_ENFORCEMENT=off: o PIN NÃO é exigido nas operações de dinheiro (só desenvolvimento)");
  }
  if (!env.ADMIN_MFA) {
    app.log.warn("ADMIN_MFA=off: os administradores NÃO precisam do segundo fator (só desenvolvimento)");
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
