import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import { TransferError } from "../transfers/transfers.types.js";
import type { AuditEntry } from "./audit.types.js";

const env = loadEnv(TEST_ENV);
const headers = {
  authorization: `Bearer ${VALID_TOKEN}`,
  "idempotency-key": "chave-auditoria-0001",
};
const body = { toPhone: "+245955000002", amount: 1000 };

let app: Awaited<ReturnType<typeof buildApp>>;
let entries: AuditEntry[] = [];
let failAudit = false;
let failTransfer = false;

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({
      audit: {
        record: async (entry) => {
          if (failAudit) {
            throw new Error("auditoria indisponível");
          }
          entries.push(entry);
        },
      },
      transfers: {
        createTransfer: async (input) => {
          if (failTransfer) {
            throw new TransferError("insufficient_funds", 422, "Saldo insuficiente.");
          }
          return {
            transactionId: "88888888-8888-4888-8888-888888888888",
            replayed: false,
            amount: input.amount,
            currency: "XOF",
            toPhone: input.toPhone,
          };
        },
      },
    }),
  );
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  entries = [];
  failAudit = false;
  failTransfer = false;
});

describe("auditoria de operações de escrita", () => {
  it("regista POST /v1/transfers bem-sucedido, sem corpo nem cabeçalhos", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/transfers", headers, payload: body });
    expect(res.statusCode).toBe(201);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: TEST_USER.id,
      actorType: "user",
      action: "POST /v1/transfers",
      metadata: { status: 201 },
    });
    expect(JSON.stringify(entries[0])).not.toContain(VALID_TOKEN);
    expect(JSON.stringify(entries[0])).not.toContain("955000002");
  });

  it("não regista pedidos GET", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/wallet",
      headers: { authorization: headers.authorization },
    });
    expect(res.statusCode).toBe(200);
    expect(entries).toHaveLength(0);
  });

  it("não regista operações que falharam (>= 400)", async () => {
    failTransfer = true;
    const res = await app.inject({ method: "POST", url: "/v1/transfers", headers, payload: body });
    expect(res.statusCode).toBe(422);
    expect(entries).toHaveLength(0);
  });

  it("uma falha de auditoria não quebra a resposta ao cliente", async () => {
    failAudit = true;
    const res = await app.inject({ method: "POST", url: "/v1/transfers", headers, payload: body });
    expect(res.statusCode).toBe(201);
  });
});
