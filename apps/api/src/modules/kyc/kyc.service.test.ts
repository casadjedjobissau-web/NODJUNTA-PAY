import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createKycService, KYC_BUCKET } from "./kyc.service.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;

const USER = "11111111-1111-4111-8111-111111111111";
const SUB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const SUB_ROW = {
  id: SUB_ID,
  target_level: 1,
  document_type: "id_card",
  status: "draft",
  review_reason: null,
  submitted_at: null,
  created_at: "2026-11-10T12:00:00.000Z",
};

interface Options {
  kycLevel?: number | null;
  submission?: Record<string, unknown> | null;
  files?: string[];
  rpc?: Record<string, Handler>;
}

function chain(single: unknown, list: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => ({ data: single, error: null });
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data: list, error: null }).then(resolve, reject);
  return builder;
}

function makeClient(options: Options = {}) {
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const signedCalls: Array<{ bucket: string; path: string; upsert: unknown }> = [];
  const listCalls: Array<{ bucket: string; prefix: string }> = [];
  const submission = options.submission === undefined ? SUB_ROW : options.submission;
  const level = options.kycLevel === undefined ? 0 : options.kycLevel;

  const client = {
    from: (table: string) => {
      if (table === "profiles") {
        return chain(level === null ? null : { kyc_level: level }, []);
      }
      if (table === "kyc_submissions") {
        return chain(submission, submission ? [submission] : []);
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      const handler = options.rpc?.[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string, opts: { upsert?: boolean }) => {
          signedCalls.push({ bucket, path, upsert: opts?.upsert });
          return { data: { token: `tok-${path}`, signedUrl: `https://exemplo.local/${path}` }, error: null };
        },
        list: async (prefix: string) => {
          listCalls.push({ bucket, prefix });
          return { data: (options.files ?? []).map((name) => ({ name })), error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  return { client, rpcCalls, signedCalls, listCalls };
}

describe("createKycService", () => {
  it("getStatus devolve o nível e a última submissão", async () => {
    const { client } = makeClient({ kycLevel: 1 });
    const service = createKycService(client);

    const status = await service.getStatus(USER);

    expect(status.kycLevel).toBe(1);
    expect(status.submission).toMatchObject({
      id: SUB_ID,
      targetLevel: 1,
      documentType: "id_card",
      status: "draft",
    });
  });

  it("getStatus sem perfil nem submissões devolve nível 0 e null", async () => {
    const { client } = makeClient({ kycLevel: null, submission: null });
    const service = createKycService(client);

    expect(await service.getStatus(USER)).toEqual({ kycLevel: 0, submission: null });
  });

  it("createSubmission chama a função SQL e devolve a submissão criada", async () => {
    const { client, rpcCalls } = makeClient({
      rpc: { create_kyc_submission: () => ({ data: SUB_ID, error: null }) },
    });
    const service = createKycService(client);

    const view = await service.createSubmission(USER, 1, "id_card");

    expect(view).toMatchObject({ id: SUB_ID, targetLevel: 1, status: "draft" });
    expect(rpcCalls).toEqual([
      {
        fn: "create_kyc_submission",
        params: { p_user_id: USER, p_target_level: 1, p_document_type: "id_card" },
      },
    ]);
  });

  it("mapeia NJ014 para submission_open (409)", async () => {
    const { client } = makeClient({
      rpc: {
        create_kyc_submission: () => ({ data: null, error: { code: "NJ014", message: "aberta" } }),
      },
    });
    const service = createKycService(client);

    await expect(service.createSubmission(USER, 1, "id_card")).rejects.toMatchObject({
      code: "submission_open",
      httpStatus: 409,
    });
  });

  it("mapeia NJ013 para invalid_target_level (422)", async () => {
    const { client } = makeClient({
      rpc: {
        create_kyc_submission: () => ({ data: null, error: { code: "NJ013", message: "nivel" } }),
      },
    });
    const service = createKycService(client);

    await expect(service.createSubmission(USER, 1, "id_card")).rejects.toMatchObject({
      code: "invalid_target_level",
      httpStatus: 422,
    });
  });

  it("createUploadTargets gera caminhos fixos por utilizador e submissão no bucket privado", async () => {
    const { client, signedCalls } = makeClient();
    const service = createKycService(client);

    const targets = await service.createUploadTargets(USER, SUB_ID, ["front", "selfie"]);

    expect(targets.map((t) => t.path)).toEqual([`${USER}/${SUB_ID}/front`, `${USER}/${SUB_ID}/selfie`]);
    expect(signedCalls).toEqual([
      { bucket: KYC_BUCKET, path: `${USER}/${SUB_ID}/front`, upsert: true },
      { bucket: KYC_BUCKET, path: `${USER}/${SUB_ID}/selfie`, upsert: true },
    ]);
  });

  it("createUploadTargets recusa submissões que já não são rascunho", async () => {
    const { client, signedCalls } = makeClient({ submission: { ...SUB_ROW, status: "pending" } });
    const service = createKycService(client);

    await expect(service.createUploadTargets(USER, SUB_ID, ["front"])).rejects.toMatchObject({
      code: "invalid_state",
      httpStatus: 409,
    });
    expect(signedCalls).toEqual([]);
  });

  it("submit exige o verso do bilhete de identidade", async () => {
    const { client, rpcCalls } = makeClient({ files: ["front", "selfie"] });
    const service = createKycService(client);

    const err = await service.submit(USER, SUB_ID).catch((e: unknown) => e);

    expect(err).toMatchObject({ code: "missing_documents", httpStatus: 422 });
    expect((err as Error).message).toContain("back");
    expect(rpcCalls).toEqual([]);
  });

  it("submit com todos os documentos chama a função SQL", async () => {
    const { client, rpcCalls, listCalls } = makeClient({
      files: ["front", "back", "selfie"],
      rpc: { submit_kyc_submission: () => ({ data: "pending", error: null }) },
    });
    const service = createKycService(client);

    await service.submit(USER, SUB_ID);

    expect(listCalls).toEqual([{ bucket: KYC_BUCKET, prefix: `${USER}/${SUB_ID}` }]);
    expect(rpcCalls).toEqual([
      { fn: "submit_kyc_submission", params: { p_submission_id: SUB_ID, p_user_id: USER } },
    ]);
  });

  it("submit de passaporte não exige o verso", async () => {
    const { client, rpcCalls } = makeClient({
      submission: { ...SUB_ROW, document_type: "passport" },
      files: ["front", "selfie"],
      rpc: { submit_kyc_submission: () => ({ data: "pending", error: null }) },
    });
    const service = createKycService(client);

    await service.submit(USER, SUB_ID);

    expect(rpcCalls).toHaveLength(1);
  });

  it("submit repetido numa submissão pendente não consulta o storage nem a base de dados", async () => {
    const { client, rpcCalls, listCalls } = makeClient({
      submission: { ...SUB_ROW, status: "pending" },
    });
    const service = createKycService(client);

    const view = await service.submit(USER, SUB_ID);

    expect(view.status).toBe("pending");
    expect(listCalls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });
});
