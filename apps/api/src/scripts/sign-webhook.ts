import "dotenv/config";
import { signPayload } from "../lib/webhook-signature.js";

// Uso: npm run sign-webhook -w apps/api -- deposit.completed sandbox-dep-ID_DO_PEDIDO evt-12345678
// Imprime um comando curl com a assinatura correta, para testar o webhook sandbox.

const secret = process.env.WEBHOOK_SECRET_SANDBOX;
const [type, providerRef, eventId] = process.argv.slice(2);

if (!secret || secret.length < 32) {
  console.error("Defina WEBHOOK_SECRET_SANDBOX (mínimo 32 caracteres) no .env");
  process.exit(1);
}
if (!type || !providerRef || !eventId) {
  console.error("Uso: sign-webhook <tipo> <providerRef> <eventId>");
  process.exit(1);
}

const body = JSON.stringify({ id: eventId, type, providerRef });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = signPayload(secret, timestamp, body);
const port = process.env.PORT ?? "3000";

console.log(
  [
    `curl -i -X POST http://localhost:${port}/webhooks/sandbox \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'X-Webhook-Timestamp: ${timestamp}' \\`,
    `  -H 'X-Webhook-Signature: ${signature}' \\`,
    `  -d '${body}'`,
  ].join("\n"),
);
