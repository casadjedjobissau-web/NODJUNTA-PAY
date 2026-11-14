import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { AuditEntry, AuditService } from "../audit/audit.types.js";
import { createSupportAdminService } from "./support.admin.service.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;

const ADMIN = "aaaaaaaa-0000-4000-8000-00000000000a";
const OWNER = "11111111-1111-4111-8111-111111111111";
const TICKET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

interface Options {
  rpc?: Record<string, Handler>;
  messages?: unknown[];
}

const ROW = {
  id: TICKET,
  seq: 7,
  user_id: OWNER,
  phone: "+245955000401",
  full_name: "Ana Gomes",
  category: "payment",
  subject: "Pagamento em falta",
  status: "open",
  created_at: "2026-11-14T10:00:00.000Z",
  last_message_at: "2026-11-14T10:05:00.000Z",
};

const MESSAGES = [
  { id: "m1", seq: 1, author_type: "user", body: "O meu pagamento não chegou.", created_at: "2026-11-14T10:00:00.000Z" },
  { id: "m2", seq: 2, author_type: "admin", body: "Estamos a verificar.", created_at: "2026-11-14T10:05:00.000Z" },
];

function makeClient(options: Options, events: string[]) {
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];

  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      events.push(`rpc:${fn}`);
      rpcCalls.push({ fn, params });
      const handler = options.rpc?.[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
    from: (table: string) => {
      events.push(`from:${table}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const method of ["select", "eq", "order", "limit"]) {
        builder[method] = () => builder;
      }
      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: options.messages ?? [], error: null }).then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, rpcCalls };
}

function setup(options: Options = {}, failAudit = false) {
  const events: string[] = [];
  const entries: AuditEntry[] = [];
  const { client, rpcCalls } = makeClient(options, events);
  const audit: AuditService = {
    record: async (entry) => {
      events.push(`audit:${entry.action}`);
      if (failAudit) {
        throw new Error("auditoria indisponível");
      }
      entries.push(entry);
    },
  };
  return { service: createSupportAdminService(client, audit), events, entries, rpcCalls };
}

const getOk: Handler = () => ({ data: [ROW], error: null });

describe("createSupportAdminService: lista", () => {
  it("list converte as linhas e envia o estado e o limite", async () => {
    const { service, rpcCalls } = setup({
      rpc: { admin_list_support_tickets: () => ({ data: [ROW], error: null }) },
    });

    const items = await service.list("open", 20);

    expect(items).toEqual([
      {
        id: TICKET,
        seq: 7,
        userId: OWNER,
        phone: "+245955000401",
        fullName: "Ana Gomes",
        category: "payment",
        subject: "Pagamento em falta",
        status: "open",
        createdAt: "2026-11-14T10:00:00.000Z",
        lastMessageAt: "2026-11-14T10:05:00.000Z",
      },
    ]);
    expect(rpcCalls).toEqual([{ fn: "admin_list_support_tickets", params: { p_status: "open", p_limit: 20 } }]);
  });

  it("list sem filtro envia status nulo", async () => {
    const { service, rpcCalls } = setup({
      rpc: { admin_list_support_tickets: () => ({ data: [], error: null }) },
    });

    expect(await service.list(null, 50)).toEqual([]);
    expect(rpcCalls[0]?.params).toEqual({ p_status: null, p_limit: 50 });
  });

  it("valores desconhecidos de categoria e estado voltam a 'other' e 'open'", async () => {
    const { service } = setup({
      rpc: {
        admin_list_support_tickets: () => ({
          data: [{ ...ROW, category: "algo", status: "estranho", phone: null, full_name: null }],
          error: null,
        }),
      },
    });

    const [item] = await service.list(null, 10);

    expect(item).toMatchObject({ category: "other", status: "open", phone: null, fullName: null });
  });

  it("erros inesperados da base de dados sobem como erros genéricos", async () => {
    const { service } = setup({
      rpc: { admin_list_support_tickets: () => ({ data: null, error: { code: "XX000", message: "em baixo" } }) },
    });

    await expect(service.list(null, 10)).rejects.toThrow("em baixo");
  });
});

describe("createSupportAdminService: ver um pedido", () => {
  it("audita ANTES de ler as mensagens", async () => {
    const { service, events } = setup({
      rpc: { admin_get_support_ticket: getOk },
      messages: MESSAGES,
    });

    await service.get(ADMIN, TICKET, "10.0.0.1");

    const auditIndex = events.indexOf("audit:ADMIN_SUPPORT_TICKET_VIEW");
    const messagesIndex = events.indexOf("from:support_messages");
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(messagesIndex).toBeGreaterThan(auditIndex);
  });

  it("devolve o detalhe com as mensagens e regista quem consultou e de onde", async () => {
    const { service, entries } = setup({
      rpc: { admin_get_support_ticket: getOk },
      messages: MESSAGES,
    });

    const ticket = await service.get(ADMIN, TICKET, "10.0.0.1");

    expect(ticket).toMatchObject({ id: TICKET, userId: OWNER, fullName: "Ana Gomes", status: "open" });
    expect(ticket.messages.map((message) => message.author)).toEqual(["user", "support"]);
    expect(entries).toEqual([
      {
        actorId: ADMIN,
        actorType: "admin",
        action: "ADMIN_SUPPORT_TICKET_VIEW",
        entityType: "support_ticket",
        entityId: TICKET,
        ip: "10.0.0.1",
        metadata: {},
      },
    ]);
  });

  it("pedido inexistente: 404, sem auditoria e sem ler mensagens", async () => {
    const { service, events } = setup({
      rpc: { admin_get_support_ticket: () => ({ data: [], error: null }) },
    });

    await expect(service.get(ADMIN, TICKET, null)).rejects.toMatchObject({
      code: "ticket_not_found",
      httpStatus: 404,
    });
    expect(events.some((event) => event.startsWith("audit:"))).toBe(false);
    expect(events).not.toContain("from:support_messages");
  });

  it("se a auditoria falhar, o acesso é negado e as mensagens não são lidas", async () => {
    const { service, events } = setup(
      { rpc: { admin_get_support_ticket: getOk }, messages: MESSAGES },
      true,
    );

    await expect(service.get(ADMIN, TICKET, null)).rejects.toThrow("auditoria indisponível");
    expect(events).not.toContain("from:support_messages");
  });
});

describe("createSupportAdminService: responder e mudar o estado", () => {
  it("reply envia os parâmetros à função SQL", async () => {
    const { service, rpcCalls } = setup({
      rpc: { admin_support_reply: () => ({ data: "m3", error: null }) },
    });

    await service.reply(ADMIN, TICKET, "Resolvido.", true);

    expect(rpcCalls).toEqual([
      {
        fn: "admin_support_reply",
        params: { p_admin: ADMIN, p_ticket: TICKET, p_body: "Resolvido.", p_resolve: true },
      },
    ]);
  });

  it("reply: NJ017 vira not_allowed_on_self (403)", async () => {
    const { service } = setup({
      rpc: { admin_support_reply: () => ({ data: null, error: { code: "NJ017", message: "x" } }) },
    });

    await expect(service.reply(ADMIN, TICKET, "x", false)).rejects.toMatchObject({
      code: "not_allowed_on_self",
      httpStatus: 403,
    });
  });

  it("reply: NJ024 vira ticket_closed (409)", async () => {
    const { service } = setup({
      rpc: { admin_support_reply: () => ({ data: null, error: { code: "NJ024", message: "x" } }) },
    });

    await expect(service.reply(ADMIN, TICKET, "x", false)).rejects.toMatchObject({
      code: "ticket_closed",
      httpStatus: 409,
    });
  });

  it("reply: NJ023 vira ticket_not_found (404) e NJ001 vira invalid_request (400)", async () => {
    const notFound = setup({
      rpc: { admin_support_reply: () => ({ data: null, error: { code: "NJ023", message: "x" } }) },
    });
    await expect(notFound.service.reply(ADMIN, TICKET, "x", false)).rejects.toMatchObject({
      code: "ticket_not_found",
      httpStatus: 404,
    });

    const invalid = setup({
      rpc: { admin_support_reply: () => ({ data: null, error: { code: "NJ001", message: "x" } }) },
    });
    await expect(invalid.service.reply(ADMIN, TICKET, "x", false)).rejects.toMatchObject({
      code: "invalid_request",
      httpStatus: 400,
    });
  });

  it("setStatus devolve o novo estado e envia os parâmetros", async () => {
    const { service, rpcCalls } = setup({
      rpc: { admin_support_set_status: () => ({ data: "resolved", error: null }) },
    });

    expect(await service.setStatus(ADMIN, TICKET, "resolved")).toBe("resolved");
    expect(rpcCalls).toEqual([
      {
        fn: "admin_support_set_status",
        params: { p_admin: ADMIN, p_ticket: TICKET, p_status: "resolved" },
      },
    ]);
  });

  it("setStatus falha com uma resposta inesperada", async () => {
    const { service } = setup({
      rpc: { admin_support_set_status: () => ({ data: "pending_user", error: null }) },
    });

    await expect(service.setStatus(ADMIN, TICKET, "open")).rejects.toThrow("Resposta inesperada");
  });
});
