import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { buildDeps } from "../deps.js";
import { createTestUser, readE2eConfig, type E2eConfig, type TestUser } from "./harness.js";

type App = Awaited<ReturnType<typeof buildApp>>;

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

function as<T>(reply: Reply): T {
  return reply.body as T;
}

const RUN = Date.now().toString(36);
const PINS = { a: "482913", b: "135790", c: "579135", aNew: "246801" } as const;

function runFlow(config: E2eConfig): void {
  let app: App;
  let service: SupabaseClient;
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let originalVelocity = 10;
  let transferId = "";
  let counter = 0;

  async function call(
    user: TestUser | null,
    method: "GET" | "POST",
    url: string,
    options: { body?: object; key?: string; pin?: string } = {},
  ): Promise<Reply> {
    counter += 1;
    const headers: Record<string, string> = {
      "x-forwarded-for": `10.30.${Math.floor(counter / 250)}.${(counter % 250) + 1}`,
    };
    if (user) {
      headers.authorization = `Bearer ${user.token}`;
    }
    if (options.key) {
      headers["idempotency-key"] = options.key;
    }
    if (options.pin) {
      headers["x-pin"] = options.pin;
    }
    const res = await app.inject({
      method,
      url,
      headers,
      ...(options.body !== undefined ? { payload: options.body } : {}),
    });
    let parsed: Record<string, unknown> = {};
    try {
      const value: unknown = JSON.parse(res.body);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      parsed = {};
    }
    return { status: res.statusCode, body: parsed };
  }

  async function balanceOf(user: TestUser): Promise<number> {
    const reply = await call(user, "GET", "/v1/wallet");
    expect(reply.status).toBe(200);
    return as<{ balance: number }>(reply).balance;
  }

  async function setVelocity(value: number): Promise<void> {
    const { error } = await service.from("fraud_settings").update({ value }).eq("key", "velocity_max_ops");
    if (error) {
      throw new Error(`Não foi possível alterar o limite de velocidade: ${error.message}`);
    }
  }

  function transfer(user: TestUser, to: TestUser, amount: number, key: string, pin: string): Promise<Reply> {
    return call(user, "POST", "/v1/transfers", {
      body: { toPhone: `+${to.phone}`, amount },
      key,
      pin,
    });
  }

  beforeAll(async () => {
    service = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const env = loadEnv({
      NODE_ENV: "test",
      DEFAULT_CURRENCY: "XOF",
      SUPABASE_URL: config.url,
      SUPABASE_SERVICE_ROLE_KEY: config.serviceKey,
      SANDBOX_ENABLED: "true",
      PIN_PEPPER: "pimenta-e2e-com-mais-de-32-caracteres-0123456789",
      PIN_ENFORCEMENT: "on",
      ADMIN_MFA: "on",
      PUSH_ENABLED: "false",
    });
    app = await buildApp(env, buildDeps(env, service));

    a = await createTestUser(config, service, "a");
    b = await createTestUser(config, service, "b");
    c = await createTestUser(config, service, "c");

    // O A passa ao nível 1 de verificação, para poder levantar dinheiro. O B e o C ficam no nível 0.
    const profile = await service.from("profiles").upsert({ user_id: a.id, kyc_level: 1 }, { onConflict: "user_id" });
    if (profile.error) {
      throw new Error(`Não foi possível definir o nível do utilizador A: ${profile.error.message}`);
    }

    const current = await service.from("fraud_settings").select("value").eq("key", "velocity_max_ops").single();
    originalVelocity = Number(current.data?.value ?? 10);
  });

  afterAll(async () => {
    // Deixa o limite de velocidade como estava, mesmo que um passo tenha falhado.
    await setVelocity(originalVelocity);
    await app.close();
  });

  it("o contacto público do suporte responde sem sessão", async () => {
    const reply = await call(null, "GET", "/public/support");

    expect(reply.status).toBe(200);
    const phones = as<{ phones: Array<{ e164: string }> }>(reply).phones.map((phone) => phone.e164);
    expect(phones).toEqual(expect.arrayContaining(["+245956191968", "+245956656700"]));
  });

  it("sem PIN a operação de dinheiro é recusada, um PIN fraco também, e um forte é aceite", async () => {
    const noPin = await transfer(a, b, 1000, `${RUN}-sem-pin`, PINS.a);
    expect(noPin.status).toBe(403);
    expect(as<{ error: string }>(noPin).error).toBe("pin_not_set");

    const weak = await call(a, "POST", "/v1/pin", { body: { pin: "123456" } });
    expect(weak.status).toBe(400);
    expect(as<{ error: string }>(weak).error).toBe("weak_pin");

    expect((await call(a, "POST", "/v1/pin", { body: { pin: PINS.a } })).status).toBe(201);
    expect((await call(b, "POST", "/v1/pin", { body: { pin: PINS.b } })).status).toBe(201);
    expect((await call(c, "POST", "/v1/pin", { body: { pin: PINS.c } })).status).toBe(201);

    const again = await call(a, "POST", "/v1/pin", { body: { pin: PINS.a } });
    expect(as<{ error: string }>(again).error).toBe("pin_already_set");
  });

  it("depósito: o saldo só sobe quando o provedor confirma", async () => {
    expect(await balanceOf(a)).toBe(0);
    expect(await balanceOf(b)).toBe(0);

    const created = await call(a, "POST", "/v1/deposits", { body: { amount: 50000 }, key: `${RUN}-deposito-1` });
    expect(created.status).toBe(201);
    const request = as<{ request: { id: string; status: string } }>(created).request;
    expect(request.status).toBe("pending");
    expect(await balanceOf(a)).toBe(0);

    const settled = await call(a, "POST", `/v1/sandbox/funding-requests/${request.id}/complete`);
    expect(settled.status).toBe(200);
    expect(as<{ status: string }>(settled).status).toBe("completed");
    expect(await balanceOf(a)).toBe(50000);
  });

  it("transferência: sem PIN, com PIN errado (as tentativas contam) e com o PIN certo", async () => {
    const noHeader = await call(a, "POST", "/v1/transfers", {
      body: { toPhone: `+${b.phone}`, amount: 4000 },
      key: `${RUN}-transf-1`,
    });
    expect(noHeader.status).toBe(400);
    expect(as<{ error: string }>(noHeader).error).toBe("pin_required");

    const wrong = await transfer(a, b, 4000, `${RUN}-transf-1`, "999999");
    expect(wrong.status).toBe(403);
    expect(as<{ error: string }>(wrong).error).toBe("invalid_pin");
    expect(as<{ attemptsLeft: number }>(wrong).attemptsLeft).toBeLessThan(5);
    expect(await balanceOf(a)).toBe(50000);

    const ok = await transfer(a, b, 4000, `${RUN}-transf-1`, PINS.a);
    expect(ok.status).toBe(201);
    expect(as<{ replayed: boolean }>(ok).replayed).toBe(false);
    transferId = as<{ transactionId: string }>(ok).transactionId;
    expect(transferId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a mesma chave repetida devolve o resultado e não cobra outra vez; com outro valor é recusada", async () => {
    const replay = await transfer(a, b, 4000, `${RUN}-transf-1`, PINS.a);
    expect(replay.status).toBe(200);
    expect(as<{ replayed: boolean }>(replay).replayed).toBe(true);
    expect(as<{ transactionId: string }>(replay).transactionId).toBe(transferId);
    expect(await balanceOf(a)).toBe(46000);

    const conflict = await transfer(a, b, 4001, `${RUN}-transf-1`, PINS.a);
    expect(conflict.status).toBe(409);
    expect(as<{ error: string }>(conflict).error).toBe("idempotency_conflict");
    expect(await balanceOf(a)).toBe(46000);
  });

  it("os saldos dos dois lados estão certos", async () => {
    expect(await balanceOf(a)).toBe(46000);
    expect(await balanceOf(b)).toBe(4000);
  });

  it("recibos: um para cada lado, com números únicos e o telemóvel escondido, e um terceiro não os vê", async () => {
    const mine = await call(a, "GET", `/v1/receipts/${transferId}`);
    const theirs = await call(b, "GET", `/v1/receipts/${transferId}`);
    const stranger = await call(c, "GET", `/v1/receipts/${transferId}`);

    expect(mine.status).toBe(200);
    const sent = as<{
      receiptNumber: string;
      direction: string;
      amount: number;
      fee: number;
      total: number;
      counterparty: { detail: string | null };
    }>(mine);
    expect(sent.receiptNumber).toMatch(/^NP-\d{6}-\d{6}$/);
    expect(sent.direction).toBe("out");
    expect(sent.amount).toBe(4000);
    expect(sent.total).toBe(sent.amount + sent.fee);
    expect(sent.counterparty.detail).toContain("***");
    expect(sent.counterparty.detail).not.toContain(b.phone);

    expect(theirs.status).toBe(200);
    const received = as<{ receiptNumber: string; direction: string }>(theirs);
    expect(received.direction).toBe("in");
    expect(received.receiptNumber).not.toBe(sent.receiptNumber);

    expect(stranger.status).toBe(404);
    expect(as<{ error: string }>(stranger).error).toBe("receipt_not_available");

    const again = await call(a, "GET", `/v1/receipts/${transferId}`);
    expect(as<{ receiptNumber: string }>(again).receiptNumber).toBe(sent.receiptNumber);
  });

  it("o extrato mostra a transferência, como débito para um e crédito para o outro", async () => {
    const mine = await call(a, "GET", "/v1/wallet/statement?limit=5");
    const theirs = await call(b, "GET", "/v1/wallet/statement?limit=5");

    const first = as<{ items: Array<{ transactionId: string; direction: string; amount: number }> }>(mine).items[0];
    const second = as<{ items: Array<{ transactionId: string; direction: string; amount: number }> }>(theirs).items[0];
    expect(first).toMatchObject({ transactionId: transferId, direction: "debit", amount: 4000 });
    expect(second).toMatchObject({ transactionId: transferId, direction: "credit", amount: 4000 });
  });

  it("quem recebeu fica com uma notificação por ler, que se marca como lida", async () => {
    const list = await call(b, "GET", "/v1/notifications?limit=10");
    const page = as<{ unreadCount: number; items: Array<{ kind: string; read: boolean }> }>(list);

    expect(page.unreadCount).toBeGreaterThanOrEqual(1);
    expect(page.items.some((item) => item.kind === "transfer_received" && !item.read)).toBe(true);

    const all = await call(b, "POST", "/v1/notifications/read-all");
    expect(all.status).toBe(200);
    expect(as<{ updated: number }>(all).updated).toBeGreaterThanOrEqual(1);

    const after = await call(b, "GET", "/v1/notifications?limit=10");
    expect(as<{ unreadCount: number }>(after).unreadCount).toBe(0);
  });

  it("o livro-razão fecha a zero e a vista de integridade está vazia", async () => {
    const summary = await service.rpc("admin_report_summary", { p_currency: "XOF" });
    expect(summary.error).toBeNull();
    const rows = (summary.data ?? []) as Array<{ ledger_gap: number | string }>;
    expect(Number(rows[0]?.ledger_gap)).toBe(0);

    const issues = await service.from("ledger_integrity_issues").select("*");
    expect(issues.error).toBeNull();
    expect(issues.data ?? []).toHaveLength(0);
  });

  it("antifraude: a velocidade bloqueia à terceira operação, gera alerta e não mexe no saldo", async () => {
    await setVelocity(2);

    const second = await transfer(a, b, 500, `${RUN}-transf-2`, PINS.a);
    expect(second.status).toBe(201);
    expect(await balanceOf(a)).toBe(45500);

    const third = await transfer(a, b, 500, `${RUN}-transf-3`, PINS.a);
    expect(third.status).toBe(429);
    expect(as<{ error: string }>(third).error).toBe("too_many_operations");
    expect(await balanceOf(a)).toBe(45500);

    const alerts = await service.from("fraud_alerts").select("rule, decision").eq("user_id", a.id);
    expect(alerts.error).toBeNull();
    expect(alerts.data).toEqual(expect.arrayContaining([{ rule: "velocity", decision: "block" }]));

    await setVelocity(originalVelocity);
  });

  it("antifraude: trocar o PIN pausa os levantamentos", async () => {
    const changed = await call(a, "POST", "/v1/pin/change", {
      body: { currentPin: PINS.a, newPin: PINS.aNew },
    });
    expect(changed.status).toBe(200);

    const withdrawal = await call(a, "POST", "/v1/withdrawals", {
      body: { amount: 1000, destination: "+245955000099" },
      key: `${RUN}-levantar-1`,
      pin: PINS.aNew,
    });
    expect(withdrawal.status).toBe(403);
    expect(as<{ error: string }>(withdrawal).error).toBe("withdrawal_cooldown");
    expect(await balanceOf(a)).toBe(45500);
  });

  it("sem verificação de identidade, o levantamento é recusado", async () => {
    const withdrawal = await call(b, "POST", "/v1/withdrawals", {
      body: { amount: 1000, destination: "+245955000099" },
      key: `${RUN}-levantar-b`,
      pin: PINS.b,
    });

    expect([403, 422]).toContain(withdrawal.status);
    expect(as<{ error: string }>(withdrawal).error).toBe("kyc_level_required");
  });

  it("suporte: o pedido é privado, e a resposta da equipa chega como notificação", async () => {
    const created = await call(a, "POST", "/v1/support/tickets", {
      body: { category: "payment", subject: "Pagamento de teste", message: "Mensagem de teste do fluxo completo." },
    });
    expect(created.status).toBe(201);
    const ticketId = as<{ id: string }>(created).id;

    const stranger = await call(b, "GET", `/v1/support/tickets/${ticketId}`);
    expect(stranger.status).toBe(404);
    expect(as<{ error: string }>(stranger).error).toBe("ticket_not_found");

    // A equipa responde pela função da base de dados: o painel exige o segundo fator, que aqui não se automatiza.
    const replied = await service.rpc("admin_support_reply", {
      p_admin: b.id,
      p_ticket: ticketId,
      p_body: "Estamos a verificar.",
      p_resolve: false,
    });
    expect(replied.error).toBeNull();

    const detail = await call(a, "GET", `/v1/support/tickets/${ticketId}`);
    const ticket = as<{ status: string; messages: Array<{ author: string }> }>(detail);
    expect(ticket.status).toBe("pending_user");
    expect(ticket.messages[ticket.messages.length - 1]?.author).toBe("support");

    const notifications = await call(a, "GET", "/v1/notifications?limit=10");
    const items = as<{ items: Array<{ kind: string }> }>(notifications).items;
    expect(items.some((item) => item.kind === "support_reply")).toBe(true);
  });

  it("eliminar conta: com saldo é recusada, sem saldo anonimiza e regista", async () => {
    const check = await call(a, "GET", "/v1/account/deletion-check");
    const blockers = as<{ canDelete: boolean; blockers: Array<{ code: string }> }>(check);
    expect(blockers.canDelete).toBe(false);
    expect(blockers.blockers.map((item) => item.code)).toContain("balance");

    const refused = await call(a, "POST", "/v1/account/delete", { body: { confirm: "ELIMINAR" }, pin: PINS.aNew });
    expect(refused.status).toBe(409);
    expect(as<{ error: string }>(refused).error).toBe("balance_not_zero");

    const free = await call(c, "GET", "/v1/account/deletion-check");
    expect(as<{ canDelete: boolean }>(free).canDelete).toBe(true);

    const deleted = await call(c, "POST", "/v1/account/delete", { body: { confirm: "ELIMINAR" }, pin: PINS.c });
    expect(deleted.status).toBe(200);
    expect(as<{ status: string }>(deleted).status).toBe("deleted");

    const user = await service.auth.admin.getUserById(c.id);
    expect(user.data.user?.phone).toBeFalsy();

    const record = await service.from("account_deletions").select("user_id").eq("user_id", c.id);
    expect(record.data ?? []).toHaveLength(1);
  });
}

const result = readE2eConfig();

if (result.ok) {
  describe("fluxo completo de ponta a ponta", () => {
    runFlow(result.config);
  });
} else {
  describe("fluxo completo de ponta a ponta", () => {
    it("precisa de um Supabase local configurado", () => {
      throw new Error(`${result.reason} Veja docs/E2E.md.`);
    });
  });
}
