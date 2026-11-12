import { describe, expect, it } from "vitest";
import { createAdminApi, type AdminRequestOptions, type RequestFn } from "./admin-api";

function recorder() {
  const calls: Array<{ path: string; options: AdminRequestOptions | undefined }> = [];
  const request: RequestFn = async <T>(path: string, options?: AdminRequestOptions): Promise<T> => {
    calls.push({ path, options });
    return {} as T;
  };
  return { api: createAdminApi(request), calls };
}

const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("createAdminApi", () => {
  it("me e overview usam GET nos caminhos certos", async () => {
    const { api, calls } = recorder();
    await api.me();
    await api.overview();
    expect(calls.map((call) => call.path)).toEqual(["/admin/v1/me", "/admin/v1/overview"]);
    expect(calls.every((call) => call.options === undefined)).toBe(true);
  });

  it("listKyc inclui o estado pedido", async () => {
    const { api, calls } = recorder();
    await api.listKyc("approved");
    expect(calls[0]?.path).toBe("/admin/v1/kyc/submissions?status=approved&limit=50");
  });

  it("kycDocuments usa o identificador do pedido", async () => {
    const { api, calls } = recorder();
    await api.kycDocuments(ID);
    expect(calls[0]?.path).toBe(`/admin/v1/kyc/submissions/${ID}/documents`);
  });

  it("reviewKyc: aprovar não envia motivo; recusar envia", async () => {
    const { api, calls } = recorder();
    await api.reviewKyc(ID, true);
    await api.reviewKyc(ID, false, "foto ilegível");
    expect(calls[0]?.options).toEqual({ method: "POST", body: { approve: true } });
    expect(calls[1]?.options).toEqual({ method: "POST", body: { approve: false, reason: "foto ilegível" } });
    expect(calls[0]?.path).toBe(`/admin/v1/kyc/submissions/${ID}/review`);
  });

  it("listMerchants com e sem filtro de estado", async () => {
    const { api, calls } = recorder();
    await api.listMerchants("pending");
    await api.listMerchants();
    expect(calls[0]?.path).toBe("/admin/v1/merchants?status=pending&limit=50");
    expect(calls[1]?.path).toBe("/admin/v1/merchants?limit=50");
  });

  it("setMerchantStatus envia o novo estado", async () => {
    const { api, calls } = recorder();
    await api.setMerchantStatus("AB12CD34", "suspended");
    expect(calls[0]).toEqual({
      path: "/admin/v1/merchants/AB12CD34/status",
      options: { method: "POST", body: { status: "suspended" } },
    });
  });

  it("lookupUser codifica o + do telefone", async () => {
    const { api, calls } = recorder();
    await api.lookupUser("+245955000002");
    expect(calls[0]?.path).toBe("/admin/v1/users/lookup?phone=%2B245955000002");
  });

  it("setFrozen: congelar leva motivo; descongelar não", async () => {
    const { api, calls } = recorder();
    await api.setFrozen(ID, true, "suspeita de fraude");
    await api.setFrozen(ID, false);
    expect(calls[0]?.options).toEqual({ method: "POST", body: { frozen: true, reason: "suspeita de fraude" } });
    expect(calls[1]?.options).toEqual({ method: "POST", body: { frozen: false } });
    expect(calls[0]?.path).toBe(`/admin/v1/users/${ID}/freeze`);
  });

  it("listAudit com e sem cursor", async () => {
    const { api, calls } = recorder();
    await api.listAudit();
    await api.listAudit(90);
    expect(calls[0]?.path).toBe("/admin/v1/audit?limit=50");
    expect(calls[1]?.path).toBe("/admin/v1/audit?limit=50&before=90");
  });
});
