import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps, makeKycView } from "../../testing/fakes.js";
import { KycError, type KycDocumentType, type KycSubmissionView } from "./kyc.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };
const SUB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let app: Awaited<ReturnType<typeof buildApp>>;
let createCalls: Array<{ userId: string; targetLevel: number; documentType: KycDocumentType }> = [];
let nextCreate: () => Promise<KycSubmissionView>;
let nextSubmit: () => Promise<KycSubmissionView>;

beforeAll(async () => {
  const base = makeFakeDeps();
  app = await buildApp(
    env,
    makeFakeDeps({
      kyc: {
        getStatus: base.kyc.getStatus,
        createSubmission: async (userId, targetLevel, documentType) => {
          createCalls.push({ userId, targetLevel, documentType });
          return nextCreate();
        },
        createUploadTargets: base.kyc.createUploadTargets,
        submit: async () => nextSubmit(),
      },
    }),
  );
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  createCalls = [];
  nextCreate = async () => makeKycView();
  nextSubmit = async () => makeKycView({ status: "pending" });
});

describe("GET /v1/kyc", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/kyc" });
    expect(res.statusCode).toBe(401);
  });

  it("200 devolve o nível e a última submissão", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/kyc", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kycLevel: 0, submission: null });
  });
});

describe("POST /v1/kyc/submissions", () => {
  it("400 com nível alvo 0", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/kyc/submissions",
      headers: auth,
      payload: { targetLevel: 0, documentType: "id_card" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("400 ao tentar enviar o estado (campo não permitido)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/kyc/submissions",
      headers: auth,
      payload: { targetLevel: 1, documentType: "id_card", status: "approved" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("201 em sucesso e repassa os dados ao serviço", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/kyc/submissions",
      headers: auth,
      payload: { targetLevel: 2, documentType: "passport" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("draft");
    expect(createCalls).toEqual([
      { userId: TEST_USER.id, targetLevel: 2, documentType: "passport" },
    ]);
  });

  it("409 quando já existe um pedido em aberto", async () => {
    nextCreate = async () => {
      throw new KycError("submission_open", 409, "Já existe um pedido de verificação em aberto.");
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/kyc/submissions",
      headers: auth,
      payload: { targetLevel: 1, documentType: "id_card" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("submission_open");
  });
});

describe("POST /v1/kyc/submissions/:id/upload-urls", () => {
  it("400 com identificador que não é UUID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/kyc/submissions/nao-e-uuid/upload-urls",
      headers: auth,
      payload: { kinds: ["front"] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_params");
  });

  it("400 com tipos repetidos", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/kyc/submissions/${SUB_ID}/upload-urls`,
      headers: auth,
      payload: { kinds: ["front", "front"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("200 devolve um alvo de envio por tipo pedido", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/kyc/submissions/${SUB_ID}/upload-urls`,
      headers: auth,
      payload: { kinds: ["front", "selfie"] },
    });
    expect(res.statusCode).toBe(200);
    const targets = res.json().targets as Array<{ kind: string; path: string }>;
    expect(targets.map((t) => t.kind)).toEqual(["front", "selfie"]);
    expect(targets[0]?.path).toBe(`${TEST_USER.id}/${SUB_ID}/front`);
  });
});

describe("POST /v1/kyc/submissions/:id/submit", () => {
  it("422 quando faltam documentos", async () => {
    nextSubmit = async () => {
      throw new KycError("missing_documents", 422, "Faltam documentos: back.");
    };
    const res = await app.inject({
      method: "POST",
      url: `/v1/kyc/submissions/${SUB_ID}/submit`,
      headers: auth,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("missing_documents");
  });

  it("200 devolve a submissão pendente", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/kyc/submissions/${SUB_ID}/submit`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("pending");
  });
});
