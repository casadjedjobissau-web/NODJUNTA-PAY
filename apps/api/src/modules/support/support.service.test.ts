import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupportService } from "./support.service.js";

const USER = "11111111-1111-4111-8111-111111111111";
const TICKET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CREATED = "2026-11-14T10:00:00.000Z";
const LAST = "2026-11-14T10:05:00.000Z";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;

interface TableResult {
  single?: unknown;
  list?: unknown[];
  error?: { message: string } | null;
}

interface Op {
  table: string;
  method: string;
  args: unknown[];
}

interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

const TICKET_ROW = {
  id: TICKET,
  seq: 7,
  category: "payment",
  subject: "Pagamento em falta",
  status: "open",
  created_at: CREATED,
  last_message_at: LAST,
};

const MESSAGE_USER = {
  id: "m1",
  seq: 1,
  author_type: "user",
  body: "O meu pagamento não chegou.",
  created_at: CREATED,
};

const MESSAGE_ADMIN = {
  id: "m2",
  seq: 2,
  author_type: "admin",
  body: "Estamos a verificar.",
  created_at: LAST,
};

function makeClient(options: { tables?: Record<string, TableResult>; rpc?: Record<string, Handler> }) {
  const ops: Op[] = [];
  const rpcCalls: RpcCall[] = [];

  const client = {
    from: (table: string) => {
      const entry = options.tables?.[table] ?? {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const method of ["select", "eq", "order", "limit", "lt"]) {
        builder[method] = (...args: unknown[]) => {
          ops.push({ table, method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => ({ data: entry.single ?? null, error: entry.error ?? null });
      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: entry.list ?? [], error: entry.error ?? null }).then(resolve, reject);
      return builder;
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      const handler = options.rpc?.[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
  } as unknown as SupabaseClient;

  return { client, ops, rpcCalls };
}

function opsOf(ops: Op[], table: string, method: string): unknown[][] {
  return ops.filter((op) => op.table === table && op.method === method).map((op) => op.args);
}

function detailTables(): Record<string, TableResult> {
  return {
    support_tickets: { single: TICKET_ROW },
    support_messages: { list: [MESSAGE_USER, MESSAGE_ADMIN] },
  };
}

const input = {
  category: "payment" as const,
  subject: "Pagamento em falta",
  message: "O meu pagamento não chegou.",
};

describe("createSupportService: criar e listar", () => {
  it("createTicket cria o pedido pela função SQL e devolve o detalhe", async () => {
    const { client, rpcCalls } = makeClient({
      rpc: { create_support_ticket: () => ({ data: TICKET, error: null }) },
      tables: detailTables(),
    });

    const ticket = await createSupportService(client).createTicket(USER, input);

    expect(rpcCalls).toEqual([
      {
        fn: "create_support_ticket",
        params: {
          p_user: USER,
          p_category: "payment",
          p_subject: "Pagamento em falta",
          p_body: "O meu pagamento não chegou.",
        },
      },
    ]);
    expect(ticket).toEqual({
      id: TICKET,
      seq: 7,
      category: "payment",
      subject: "Pagamento em falta",
      status: "open",
      createdAt: CREATED,
      lastMessageAt: LAST,
      messages: [
        { id: "m1", seq: 1, author: "user", body: "O meu pagamento não chegou.", createdAt: CREATED },
        { id: "m2", seq: 2, author: "support", body: "Estamos a verificar.", createdAt: LAST },
      ],
    });
  });

  it("NJ022 vira too_many_open_tickets (429) e a mensagem indica o limite de 5", async () => {
    const { client } = makeClient({
      rpc: { create_support_ticket: () => ({ data: null, error: { code: "NJ022", message: "x" } }) },
    });

    const error = await createSupportService(client)
      .createTicket(USER, input)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "too_many_open_tickets", httpStatus: 429 });
    expect((error as Error).message).toContain("5");
  });

  it("NJ001 vira invalid_request (400)", async () => {
    const { client } = makeClient({
      rpc: { create_support_ticket: () => ({ data: null, error: { code: "NJ001", message: "x" } }) },
    });

    await expect(createSupportService(client).createTicket(USER, input)).rejects.toMatchObject({
      code: "invalid_request",
      httpStatus: 400,
    });
  });

  it("falha com uma resposta inesperada da função SQL", async () => {
    const { client } = makeClient({
      rpc: { create_support_ticket: () => ({ data: 123, error: null }) },
    });

    await expect(createSupportService(client).createTicket(USER, input)).rejects.toThrow("Resposta inesperada");
  });

  it("list pede uma linha a mais, filtra pelo utilizador e devolve o cursor", async () => {
    const rows = [9, 8, 7].map((seq) => ({ ...TICKET_ROW, id: `t-${seq}`, seq }));
    const { client, ops } = makeClient({ tables: { support_tickets: { list: rows } } });

    const page = await createSupportService(client).list(USER, { limit: 2 });

    expect(page.items.map((item) => item.seq)).toEqual([9, 8]);
    expect(page.nextCursor).toBe(8);
    expect(opsOf(ops, "support_tickets", "eq")).toEqual([["user_id", USER]]);
    expect(opsOf(ops, "support_tickets", "order")).toEqual([["seq", { ascending: false }]]);
    expect(opsOf(ops, "support_tickets", "limit")).toEqual([[3]]);
    expect(opsOf(ops, "support_tickets", "lt")).toEqual([]);
  });

  it("list aplica o cursor 'before' quando existe", async () => {
    const { client, ops } = makeClient({ tables: { support_tickets: { list: [] } } });

    const page = await createSupportService(client).list(USER, { limit: 10, before: 50 });

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(opsOf(ops, "support_tickets", "lt")).toEqual([["seq", 50]]);
  });
});

describe("createSupportService: ler um pedido", () => {
  it("get devolve 404 quando o pedido não existe ou não é do utilizador", async () => {
    const { client } = makeClient({ tables: { support_tickets: { single: null } } });

    await expect(createSupportService(client).get(USER, TICKET)).rejects.toMatchObject({
      code: "ticket_not_found",
      httpStatus: 404,
    });
  });

  it("get usa 'other' e 'open' para valores desconhecidos e nunca expõe quem escreveu", async () => {
    const { client } = makeClient({
      tables: {
        support_tickets: { single: { ...TICKET_ROW, category: "algo", status: "estranho" } },
        support_messages: { list: [MESSAGE_ADMIN] },
      },
    });

    const ticket = await createSupportService(client).get(USER, TICKET);

    expect(ticket.category).toBe("other");
    expect(ticket.status).toBe("open");
    const message = ticket.messages[0];
    expect(message?.author).toBe("support");
    expect(Object.keys(message ?? {}).sort()).toEqual(["author", "body", "createdAt", "id", "seq"]);
  });

  it("get lê as mensagens por ordem crescente, com limite de 200, filtrando pelo dono", async () => {
    const { client, ops } = makeClient({ tables: detailTables() });

    await createSupportService(client).get(USER, TICKET);

    expect(opsOf(ops, "support_tickets", "eq")).toEqual([
      ["id", TICKET],
      ["user_id", USER],
    ]);
    expect(opsOf(ops, "support_messages", "eq")).toEqual([["ticket_id", TICKET]]);
    expect(opsOf(ops, "support_messages", "order")).toEqual([["seq", { ascending: true }]]);
    expect(opsOf(ops, "support_messages", "limit")).toEqual([[200]]);
  });

  it("get falha quando a leitura do pedido falha", async () => {
    const { client } = makeClient({ tables: { support_tickets: { error: { message: "sem ligação" } } } });

    await expect(createSupportService(client).get(USER, TICKET)).rejects.toThrow(
      "Falha ao ler o pedido de suporte",
    );
  });

  it("get falha quando a leitura das mensagens falha", async () => {
    const { client } = makeClient({
      tables: {
        support_tickets: { single: TICKET_ROW },
        support_messages: { error: { message: "sem ligação" } },
      },
    });

    await expect(createSupportService(client).get(USER, TICKET)).rejects.toThrow("Falha ao ler as mensagens");
  });
});

describe("createSupportService: responder e fechar", () => {
  it("reply envia a mensagem e devolve o detalhe atualizado", async () => {
    const { client, rpcCalls } = makeClient({
      rpc: { add_support_message: () => ({ data: "m3", error: null }) },
      tables: detailTables(),
    });

    const ticket = await createSupportService(client).reply(USER, TICKET, "Obrigado.");

    expect(rpcCalls).toEqual([
      { fn: "add_support_message", params: { p_user: USER, p_ticket: TICKET, p_body: "Obrigado." } },
    ]);
    expect(ticket.id).toBe(TICKET);
    expect(ticket.messages).toHaveLength(2);
  });

  it("reply: NJ024 vira ticket_closed (409)", async () => {
    const { client } = makeClient({
      rpc: { add_support_message: () => ({ data: null, error: { code: "NJ024", message: "x" } }) },
    });

    await expect(createSupportService(client).reply(USER, TICKET, "Obrigado.")).rejects.toMatchObject({
      code: "ticket_closed",
      httpStatus: 409,
    });
  });

  it("reply: NJ023 vira ticket_not_found (404)", async () => {
    const { client } = makeClient({
      rpc: { add_support_message: () => ({ data: null, error: { code: "NJ023", message: "x" } }) },
    });

    await expect(createSupportService(client).reply(USER, TICKET, "Obrigado.")).rejects.toMatchObject({
      code: "ticket_not_found",
      httpStatus: 404,
    });
  });

  it("close fecha o pedido e devolve o detalhe", async () => {
    const { client, rpcCalls } = makeClient({
      rpc: { close_support_ticket: () => ({ data: "closed", error: null }) },
      tables: detailTables(),
    });

    const ticket = await createSupportService(client).close(USER, TICKET);

    expect(rpcCalls).toEqual([{ fn: "close_support_ticket", params: { p_user: USER, p_ticket: TICKET } }]);
    expect(ticket.id).toBe(TICKET);
  });

  it("close: NJ023 vira ticket_not_found (404)", async () => {
    const { client } = makeClient({
      rpc: { close_support_ticket: () => ({ data: null, error: { code: "NJ023", message: "x" } }) },
    });

    await expect(createSupportService(client).close(USER, TICKET)).rejects.toMatchObject({
      code: "ticket_not_found",
      httpStatus: 404,
    });
  });
});
