import { describe, expect, it } from "vitest";
import type { AdminRequestOptions } from "./admin-api";
import { createFraudApi, createPhoneChangeApi, createReportsApi } from "./ops-api";

const ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function makeRequest() {
  const calls: Array<{ path: string; options?: AdminRequestOptions }> = [];
  const request = (async (path: string, options?: AdminRequestOptions) => {
    calls.push(options === undefined ? { path } : { path, options });
    return {};
  }) as never;
  return { request, calls };
}

describe("createReportsApi", () => {
  it("summary, daily e merchants pedem os endereços certos", async () => {
    const { request, calls } = makeRequest();
    const api = createReportsApi(request);

    await api.summary();
    await api.daily("2026-11-01", "2026-11-10");
    await api.merchants("2026-11-01", "2026-11-10");
    await api.merchants("2026-11-01", "2026-11-10", 3);

    expect(calls.map((call) => call.path)).toEqual([
      "/admin/v1/reports/summary",
      "/admin/v1/reports/daily?from=2026-11-01&to=2026-11-10",
      "/admin/v1/reports/merchants?from=2026-11-01&to=2026-11-10&limit=10",
      "/admin/v1/reports/merchants?from=2026-11-01&to=2026-11-10&limit=3",
    ]);
    expect(calls.every((call) => call.options === undefined)).toBe(true);
  });
});

describe("createPhoneChangeApi", () => {
  it("list com e sem filtro", async () => {
    const { request, calls } = makeRequest();
    const api = createPhoneChangeApi(request);

    await api.list();
    await api.list("pending");

    expect(calls.map((call) => call.path)).toEqual([
      "/admin/v1/phone-changes?limit=50",
      "/admin/v1/phone-changes?status=pending&limit=50",
    ]);
  });

  it("create faz POST com o corpo completo", async () => {
    const { request, calls } = makeRequest();
    const input = {
      userId: ID,
      newPhone: "+245955000799",
      reason: "Perdeu o cartão SIM",
      evidence: "Verificado em videochamada de 14/11/2026.",
    };

    await createPhoneChangeApi(request).create(input);

    expect(calls[0]).toEqual({ path: "/admin/v1/phone-changes", options: { method: "POST", body: input } });
  });

  it("decide leva o motivo só quando existe", async () => {
    const { request, calls } = makeRequest();
    const api = createPhoneChangeApi(request);

    await api.decide(ID, true);
    await api.decide(ID, false, "Identidade não confirmada.");

    expect(calls[0]).toEqual({
      path: `/admin/v1/phone-changes/${ID}/decide`,
      options: { method: "POST", body: { approve: true } },
    });
    expect(calls[1]?.options?.body).toEqual({ approve: false, reason: "Identidade não confirmada." });
  });
});

describe("createFraudApi", () => {
  it("list com e sem filtro", async () => {
    const { request, calls } = makeRequest();
    const api = createFraudApi(request);

    await api.list();
    await api.list("open");

    expect(calls.map((call) => call.path)).toEqual([
      "/admin/v1/fraud/alerts?limit=50",
      "/admin/v1/fraud/alerts?status=open&limit=50",
    ]);
  });

  it("review leva a nota só quando existe", async () => {
    const { request, calls } = makeRequest();
    const api = createFraudApi(request);

    await api.review(ID);
    await api.review(ID, "Cliente contactado.");

    expect(calls[0]).toEqual({
      path: `/admin/v1/fraud/alerts/${ID}/review`,
      options: { method: "POST", body: {} },
    });
    expect(calls[1]?.options?.body).toEqual({ note: "Cliente contactado." });
  });
});
