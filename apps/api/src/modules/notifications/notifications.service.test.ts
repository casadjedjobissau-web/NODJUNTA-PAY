import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createNotificationService } from "./notifications.service.js";

const USER = "11111111-1111-4111-8111-111111111111";
const NOTIFICATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface Result {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

interface Op {
  method: string;
  args: unknown[];
}

interface Recorded {
  table: string;
  ops: Op[];
}

// Cada chamada a from() consome o resultado seguinte da lista e regista as operações encadeadas.
function makeClient(results: Result[]) {
  const recorded: Recorded[] = [];
  let index = 0;

  const client = {
    from: (table: string) => {
      const entry: Recorded = { table, ops: [] };
      recorded.push(entry);
      const result = results[index] ?? {};
      index += 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const method of ["select", "eq", "order", "limit", "lt", "is", "update"]) {
        builder[method] = (...args: unknown[]) => {
          entry.ops.push({ method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => {
        entry.ops.push({ method: "maybeSingle", args: [] });
        return { data: result.data ?? null, error: result.error ?? null };
      };
      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
          count: result.count ?? null,
        }).then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, recorded };
}

function row(seq: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${seq}`,
    seq,
    kind: "transfer_received",
    title: "Dinheiro recebido",
    body: "Recebeu 4 000 XOF.",
    data: { amount: 4000 },
    read_at: null,
    created_at: "2026-11-14T10:00:00.000Z",
    ...overrides,
  };
}

function findOp(recorded: Recorded | undefined, method: string): Op | undefined {
  return recorded?.ops.find((op) => op.method === method);
}

describe("createNotificationService: list", () => {
  it("converte as linhas e usa 'system' para tipos desconhecidos", async () => {
    const { client } = makeClient([
      {
        data: [
          row(9),
          row(8, { read_at: "2026-11-14T11:00:00.000Z", kind: "algo_novo", data: "texto" }),
          row(7, { data: [1, 2] }),
        ],
      },
      { count: 3 },
    ]);
    const service = createNotificationService(client);

    const page = await service.list(USER, { limit: 5 });

    expect(page.items[0]).toEqual({
      id: "id-9",
      seq: 9,
      kind: "transfer_received",
      title: "Dinheiro recebido",
      body: "Recebeu 4 000 XOF.",
      data: { amount: 4000 },
      read: false,
      createdAt: "2026-11-14T10:00:00.000Z",
    });
    expect(page.items[1]).toMatchObject({ kind: "system", read: true, data: {} });
    expect(page.items[2]).toMatchObject({ data: {} });
    expect(page.nextCursor).toBeNull();
    expect(page.unreadCount).toBe(3);
  });

  it("pede uma linha a mais para saber se há mais páginas e devolve o cursor", async () => {
    const { client, recorded } = makeClient([{ data: [row(9), row(8), row(7)] }, { count: 0 }]);
    const service = createNotificationService(client);

    const page = await service.list(USER, { limit: 2 });

    expect(findOp(recorded[0], "limit")?.args).toEqual([3]);
    expect(page.items.map((item) => item.seq)).toEqual([9, 8]);
    expect(page.nextCursor).toBe(8);
  });

  it("aplica o cursor 'before' só quando existe", async () => {
    const withBefore = makeClient([{ data: [] }, { count: 0 }]);
    await createNotificationService(withBefore.client).list(USER, { limit: 10, before: 50 });
    expect(findOp(withBefore.recorded[0], "lt")?.args).toEqual(["seq", 50]);

    const without = makeClient([{ data: [] }, { count: 0 }]);
    await createNotificationService(without.client).list(USER, { limit: 10 });
    expect(findOp(without.recorded[0], "lt")).toBeUndefined();
  });

  it("uma contagem nula vira zero", async () => {
    const { client } = makeClient([{ data: [] }, { count: null }]);
    const page = await createNotificationService(client).list(USER, { limit: 10 });
    expect(page.unreadCount).toBe(0);
  });

  it("falha quando a leitura falha", async () => {
    const { client } = makeClient([{ error: { message: "base de dados em baixo" } }]);
    await expect(createNotificationService(client).list(USER, { limit: 10 })).rejects.toThrow(
      "Falha ao ler notificações",
    );
  });

  it("filtra sempre pelo utilizador e conta só as não lidas", async () => {
    const { client, recorded } = makeClient([{ data: [] }, { count: 0 }]);
    await createNotificationService(client).list(USER, { limit: 10 });

    expect(recorded[0]?.table).toBe("notifications");
    expect(findOp(recorded[0], "eq")?.args).toEqual(["user_id", USER]);
    expect(recorded[1]?.table).toBe("notifications");
    expect(findOp(recorded[1], "select")?.args).toEqual(["id", { count: "exact", head: true }]);
    expect(findOp(recorded[1], "eq")?.args).toEqual(["user_id", USER]);
    expect(findOp(recorded[1], "is")?.args).toEqual(["read_at", null]);
  });
});

describe("createNotificationService: marcar como lida", () => {
  it("markRead devolve 404 quando a notificação não é do utilizador", async () => {
    const { client, recorded } = makeClient([{ data: null }]);

    await expect(createNotificationService(client).markRead(USER, NOTIFICATION)).rejects.toMatchObject({
      code: "notification_not_found",
      httpStatus: 404,
    });
    expect(recorded).toHaveLength(1);
  });

  it("markRead só atualiza notificações do utilizador que ainda não foram lidas", async () => {
    const { client, recorded } = makeClient([{ data: { id: NOTIFICATION } }, { error: null }]);

    await createNotificationService(client).markRead(USER, NOTIFICATION);

    const update = recorded[1];
    expect(update?.table).toBe("notifications");
    expect(findOp(update, "update")?.args[0]).toEqual({ read_at: expect.any(String) });
    const eqs = (update?.ops ?? []).filter((op) => op.method === "eq").map((op) => op.args);
    expect(eqs).toEqual([
      ["id", NOTIFICATION],
      ["user_id", USER],
    ]);
    expect(findOp(update, "is")?.args).toEqual(["read_at", null]);
  });

  it("markAllRead devolve quantas foram atualizadas", async () => {
    const { client, recorded } = makeClient([{ data: [{ id: "a" }, { id: "b" }] }]);

    const updated = await createNotificationService(client).markAllRead(USER);

    expect(updated).toBe(2);
    expect(findOp(recorded[0], "eq")?.args).toEqual(["user_id", USER]);
    expect(findOp(recorded[0], "is")?.args).toEqual(["read_at", null]);
    expect(findOp(recorded[0], "select")?.args).toEqual(["id"]);
  });

  it("markAllRead falha quando a atualização falha", async () => {
    const { client } = makeClient([{ error: { message: "falha" } }]);

    await expect(createNotificationService(client).markAllRead(USER)).rejects.toThrow(
      "Falha ao marcar notificações como lidas",
    );
  });
});
