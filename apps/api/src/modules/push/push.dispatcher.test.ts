import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createPushDispatcher } from "./push.dispatcher.js";
import type { PushMessage, PushSender, PushTicket } from "./push.types.js";

interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

interface Setup {
  claimed?: unknown[];
  claimError?: { message: string } | null;
  devices?: Array<{ user_id: string; push_token: string | null }>;
  devicesError?: { message: string } | null;
  markError?: { message: string } | null;
}

const USER_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const TOKEN_A1 = "ExponentPushToken[aaaaaaaa1]";
const TOKEN_A2 = "ExponentPushToken[aaaaaaaa2]";
const TOKEN_B1 = "ExponentPushToken[bbbbbbbb1]";

function claimedRow(id: string, userId: string, kind = "transfer_received") {
  return {
    out_id: id,
    out_user_id: userId,
    out_kind: kind,
    out_title: "Dinheiro recebido",
    out_body: "Recebeu 4 000 XOF.",
    out_data: { amount: 4000 },
  };
}

function makeClient(setup: Setup) {
  const rpcCalls: RpcCall[] = [];
  const cleared: unknown[][] = [];
  const queried: unknown[][] = [];
  let fromCount = 0;

  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      if (fn === "notifications_claim_for_push") {
        return { data: setup.claimed ?? [], error: setup.claimError ?? null };
      }
      if (fn === "notifications_mark_push") {
        return { data: 1, error: setup.markError ?? null };
      }
      throw new Error(`rpc inesperado: ${fn}`);
    },
    from: (table: string) => {
      if (table !== "devices") {
        throw new Error(`tabela inesperada: ${table}`);
      }
      fromCount += 1;
      const ops: string[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      builder.select = () => {
        ops.push("select");
        return builder;
      };
      builder.update = () => {
        ops.push("update");
        return builder;
      };
      builder.not = () => builder;
      builder.in = (_column: string, values: unknown[]) => {
        if (ops.includes("update")) {
          cleared.push(values);
        } else {
          queried.push(values);
        }
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const result = ops.includes("update")
          ? { data: null, error: null }
          : { data: setup.devices ?? [], error: setup.devicesError ?? null };
        return Promise.resolve(result).then(resolve, reject);
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, rpcCalls, cleared, queried, fromCount: () => fromCount };
}

function makeSender(respond: (messages: PushMessage[]) => PushTicket[] | Promise<PushTicket[]>) {
  const sent: PushMessage[][] = [];
  const sender: PushSender = {
    send: async (messages) => {
      sent.push(messages);
      return respond(messages);
    },
  };
  return { sender, sent };
}

const allOk = (messages: PushMessage[]): PushTicket[] => messages.map(() => ({ status: "ok" as const }));

function marks(calls: RpcCall[]) {
  return calls
    .filter((call) => call.fn === "notifications_mark_push")
    .map((call) => ({ state: call.params.p_state, ids: [...(call.params.p_ids as string[])].sort() }));
}

describe("createPushDispatcher", () => {
  it("sem notificações pendentes não faz mais nada", async () => {
    const { client, rpcCalls, fromCount } = makeClient({ claimed: [] });
    const { sender, sent } = makeSender(allOk);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result).toEqual({ claimed: 0, sent: 0, skipped: 0, failed: 0 });
    expect(fromCount()).toBe(0);
    expect(sent).toHaveLength(0);
    expect(rpcCalls.map((call) => call.fn)).toEqual(["notifications_claim_for_push"]);
  });

  it("reclama 100 por omissão e respeita o tamanho de lote configurado", async () => {
    const first = makeClient({ claimed: [] });
    await createPushDispatcher(first.client, makeSender(allOk).sender).dispatchOnce();
    expect(first.rpcCalls[0]?.params).toEqual({ p_limit: 100 });

    const second = makeClient({ claimed: [] });
    await createPushDispatcher(second.client, makeSender(allOk).sender, { batchSize: 25 }).dispatchOnce();
    expect(second.rpcCalls[0]?.params).toEqual({ p_limit: 25 });
  });

  it("envia a cada dispositivo do utilizador e marca como enviadas", async () => {
    const { client, rpcCalls, queried } = makeClient({
      claimed: [claimedRow("n1", USER_A), claimedRow("n2", USER_B, "payment_received")],
      devices: [
        { user_id: USER_A, push_token: TOKEN_A1 },
        { user_id: USER_A, push_token: TOKEN_A2 },
        { user_id: USER_B, push_token: TOKEN_B1 },
      ],
    });
    const { sender, sent } = makeSender(allOk);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result).toEqual({ claimed: 2, sent: 2, skipped: 0, failed: 0 });
    expect(queried[0]).toEqual([USER_A, USER_B]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.map((message) => message.to)).toEqual([TOKEN_A1, TOKEN_A2, TOKEN_B1]);
    expect(sent[0]?.[0]).toEqual({
      to: TOKEN_A1,
      title: "Dinheiro recebido",
      body: "Recebeu 4 000 XOF.",
      data: { amount: 4000, notificationId: "n1", kind: "transfer_received" },
    });
    expect(sent[0]?.[2]?.data).toMatchObject({ notificationId: "n2", kind: "payment_received" });
    expect(marks(rpcCalls)).toEqual([{ state: "sent", ids: ["n1", "n2"] }]);
  });

  it("sem dispositivos regista 'skipped' e não chama o serviço de envio", async () => {
    const { client, rpcCalls } = makeClient({ claimed: [claimedRow("n1", USER_B)], devices: [] });
    const { sender, sent } = makeSender(allOk);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result).toEqual({ claimed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(marks(rpcCalls)).toEqual([{ state: "skipped", ids: ["n1"] }]);
  });

  it("ignora tokens inválidos e linhas sem token", async () => {
    const { client, rpcCalls } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [
        { user_id: USER_A, push_token: "token-invalido" },
        { user_id: USER_A, push_token: null },
      ],
    });
    const { sender, sent } = makeSender(allOk);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result.skipped).toBe(1);
    expect(sent).toHaveLength(0);
    expect(marks(rpcCalls)).toEqual([{ state: "skipped", ids: ["n1"] }]);
  });

  it("não envia duas vezes para o mesmo token", async () => {
    const { client } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [
        { user_id: USER_A, push_token: TOKEN_A1 },
        { user_id: USER_A, push_token: TOKEN_A1 },
      ],
    });
    const { sender, sent } = makeSender(allOk);

    await createPushDispatcher(client, sender).dispatchOnce();

    expect(sent[0]).toHaveLength(1);
  });

  it("um erro de envio em todos os dispositivos marca como falhada", async () => {
    const { client, rpcCalls } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [{ user_id: USER_A, push_token: TOKEN_A1 }],
    });
    const { sender } = makeSender(() => [{ status: "error", error: "MessageRateExceeded" }]);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result).toEqual({ claimed: 1, sent: 0, skipped: 0, failed: 1 });
    expect(marks(rpcCalls)).toEqual([{ state: "failed", ids: ["n1"] }]);
  });

  it("basta um dispositivo com sucesso para contar como enviada", async () => {
    const { client, rpcCalls } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [
        { user_id: USER_A, push_token: TOKEN_A1 },
        { user_id: USER_A, push_token: TOKEN_A2 },
      ],
    });
    const { sender } = makeSender(() => [
      { status: "ok" },
      { status: "error", error: "MessageRateExceeded" },
    ]);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result.sent).toBe(1);
    expect(marks(rpcCalls)).toEqual([{ state: "sent", ids: ["n1"] }]);
  });

  it("tokens que o Expo diz que já não existem são limpos e a notificação fica 'skipped'", async () => {
    const { client, rpcCalls, cleared } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [{ user_id: USER_A, push_token: TOKEN_A1 }],
    });
    const { sender } = makeSender(() => [{ status: "error", error: "DeviceNotRegistered" }]);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result).toEqual({ claimed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(cleared).toEqual([[TOKEN_A1]]);
    expect(marks(rpcCalls)).toEqual([{ state: "skipped", ids: ["n1"] }]);
  });

  it("um token morto mais um erro real conta como falhada, mas o token morto é limpo", async () => {
    const { client, rpcCalls, cleared } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [
        { user_id: USER_A, push_token: TOKEN_A1 },
        { user_id: USER_A, push_token: TOKEN_A2 },
      ],
    });
    const { sender } = makeSender(() => [
      { status: "error", error: "DeviceNotRegistered" },
      { status: "error", error: "MessageRateExceeded" },
    ]);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result.failed).toBe(1);
    expect(cleared).toEqual([[TOKEN_A1]]);
    expect(marks(rpcCalls)).toEqual([{ state: "failed", ids: ["n1"] }]);
  });

  it("se o envio falhar por completo, as que tinham dispositivos ficam 'failed' e as outras 'skipped'", async () => {
    const { client, rpcCalls } = makeClient({
      claimed: [claimedRow("n1", USER_A), claimedRow("n2", USER_B)],
      devices: [{ user_id: USER_A, push_token: TOKEN_A1 }],
    });
    const { sender } = makeSender(() => {
      throw new Error("Expo em baixo");
    });

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result).toEqual({ claimed: 2, sent: 0, skipped: 1, failed: 1 });
    expect(marks(rpcCalls)).toEqual([
      { state: "skipped", ids: ["n2"] },
      { state: "failed", ids: ["n1"] },
    ]);
  });

  it("se faltarem bilhetes na resposta, os dispositivos sem bilhete contam como erro", async () => {
    const { client, rpcCalls } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [
        { user_id: USER_A, push_token: TOKEN_A1 },
        { user_id: USER_A, push_token: TOKEN_A2 },
      ],
    });
    const { sender } = makeSender(() => []);

    const result = await createPushDispatcher(client, sender).dispatchOnce();

    expect(result.failed).toBe(1);
    expect(marks(rpcCalls)).toEqual([{ state: "failed", ids: ["n1"] }]);
  });

  it("se a leitura dos dispositivos falhar, marca tudo como falhado e lança o erro", async () => {
    const { client, rpcCalls } = makeClient({
      claimed: [claimedRow("n1", USER_A), claimedRow("n2", USER_B)],
      devicesError: { message: "sem ligação" },
    });
    const { sender, sent } = makeSender(allOk);

    await expect(createPushDispatcher(client, sender).dispatchOnce()).rejects.toThrow("Falha ao ler dispositivos");

    expect(sent).toHaveLength(0);
    expect(marks(rpcCalls)).toEqual([{ state: "failed", ids: ["n1", "n2"] }]);
  });

  it("se marcar o resultado falhar, o erro sobe", async () => {
    const { client } = makeClient({
      claimed: [claimedRow("n1", USER_A)],
      devices: [{ user_id: USER_A, push_token: TOKEN_A1 }],
      markError: { message: "falha ao gravar" },
    });
    const { sender } = makeSender(allOk);

    await expect(createPushDispatcher(client, sender).dispatchOnce()).rejects.toThrow(
      "Falha ao marcar notificações (sent)",
    );
  });

  it("se reclamar as notificações falhar, não faz mais nada", async () => {
    const { client, rpcCalls, fromCount } = makeClient({ claimError: { message: "sem ligação" } });
    const { sender, sent } = makeSender(allOk);

    await expect(createPushDispatcher(client, sender).dispatchOnce()).rejects.toThrow(
      "Falha ao reclamar notificações",
    );

    expect(rpcCalls).toHaveLength(1);
    expect(fromCount()).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
