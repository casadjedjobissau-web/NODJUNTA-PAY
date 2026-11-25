import { describe, expect, it } from "vitest";
import type { AdminRequestOptions } from "./admin-api";
import { createSupportApi } from "./support-api";

const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function makeApi() {
  const calls: Array<{ path: string; options?: AdminRequestOptions }> = [];
  const api = createSupportApi((async (path: string, options?: AdminRequestOptions) => {
    calls.push(options === undefined ? { path } : { path, options });
    return {};
  }) as never);
  return { api, calls };
}

describe("createSupportApi", () => {
  it("list sem estado pede os 50 mais recentes", async () => {
    const { api, calls } = makeApi();

    await api.list();

    expect(calls).toEqual([{ path: "/admin/v1/support/tickets?limit=50" }]);
  });

  it("list com estado envia o filtro", async () => {
    const { api, calls } = makeApi();

    await api.list("open");

    expect(calls[0]?.path).toBe("/admin/v1/support/tickets?status=open&limit=50");
  });

  it("get usa o endereço do pedido, sem método nem corpo", async () => {
    const { api, calls } = makeApi();

    await api.get(ID);

    expect(calls).toEqual([{ path: `/admin/v1/support/tickets/${ID}` }]);
  });

  it("reply faz POST com a mensagem e se resolve ou não", async () => {
    const { api, calls } = makeApi();

    await api.reply(ID, "Estamos a verificar.", false);
    await api.reply(ID, "Resolvido.", true);

    expect(calls[0]).toEqual({
      path: `/admin/v1/support/tickets/${ID}/reply`,
      options: { method: "POST", body: { message: "Estamos a verificar.", resolve: false } },
    });
    expect(calls[1]?.options?.body).toEqual({ message: "Resolvido.", resolve: true });
  });

  it("setStatus faz POST com o novo estado", async () => {
    const { api, calls } = makeApi();

    await api.setStatus(ID, "closed");

    expect(calls[0]).toEqual({
      path: `/admin/v1/support/tickets/${ID}/status`,
      options: { method: "POST", body: { status: "closed" } },
    });
  });
});
