import { beforeAll, describe, expect, it } from "vitest";
import { FRAUD_OPERATIONS_BY_ROUTE } from "../modules/fraud/fraud.guard.js";
import { PIN_PROTECTED } from "../modules/pin/pin.guard.js";
import {
  documentedRoutes,
  findOperation,
  findProblems,
  isCustomerRoute,
  listOperations,
  loadDocument,
  parameterRefs,
  pick,
  publicRoutes,
  registeredRoutes,
  resolveRef,
  responseCodes,
} from "../testing/openapi.js";

const PIN_REF = "#/components/parameters/Pin";
const KEY_REF = "#/components/parameters/IdempotencyKey";

const doc = loadDocument("openapi.yaml");
let registered: string[] = [];

beforeAll(async () => {
  registered = (await registeredRoutes()).filter(isCustomerRoute);
});

function routesWithParameter(ref: string): string[] {
  return listOperations(doc)
    .filter((item) => parameterRefs(item.operation).includes(ref))
    .map((item) => `${item.method} ${item.path}`)
    .sort();
}

describe("docs/openapi.yaml (rotas dos clientes)", () => {
  it("é um documento OpenAPI 3 bem formado", () => {
    expect(findProblems(doc)).toEqual([]);
  });

  it("só descreve rotas dos clientes", () => {
    for (const route of documentedRoutes(doc)) {
      expect(isCustomerRoute(route)).toBe(true);
    }
  });

  it("todas as rotas registadas na API dos clientes estão documentadas", () => {
    const documented = documentedRoutes(doc);
    expect(registered.filter((route) => !documented.includes(route))).toEqual([]);
  });

  it("todas as rotas documentadas existem na API", () => {
    const documented = documentedRoutes(doc);
    expect(documented.filter((route) => !registered.includes(route))).toEqual([]);
  });

  it("tem 39 operações (um número fixo, para detetar remoções acidentais)", () => {
    expect(listOperations(doc)).toHaveLength(39);
    expect(registered).toHaveLength(39);
  });

  it("as rotas públicas, sem token, são exatamente três", () => {
    expect(publicRoutes(doc)).toEqual(["GET /health", "GET /public/support", "POST /webhooks/{provider}"]);
  });

  it("as rotas que exigem X-Pin são exatamente as protegidas pela guarda do PIN", () => {
    expect(routesWithParameter(PIN_REF)).toEqual([...PIN_PROTECTED].sort());
  });

  it("as rotas que movem dinheiro e os depósitos exigem Idempotency-Key, e só elas", () => {
    expect(routesWithParameter(KEY_REF)).toEqual([
      "POST /v1/deposits",
      "POST /v1/payments/merchant",
      "POST /v1/transfers",
      "POST /v1/withdrawals",
    ]);
  });

  it("as rotas protegidas pelo PIN documentam 400, 403 e 429", () => {
    for (const route of PIN_PROTECTED) {
      const codes = responseCodes(findOperation(doc, route));
      expect(codes, route).toEqual(expect.arrayContaining(["400", "403", "429"]));
    }
  });

  it("as rotas avaliadas pelo antifraude documentam 429 e 503", () => {
    for (const route of Object.keys(FRAUD_OPERATIONS_BY_ROUTE)) {
      const codes = responseCodes(findOperation(doc, route));
      expect(codes, route).toEqual(expect.arrayContaining(["429", "503"]));
    }
  });

  it("toda a operação que exige autenticação documenta 401", () => {
    const open = new Set(publicRoutes(doc));
    for (const item of listOperations(doc)) {
      const route = `${item.method} ${item.path}`;
      if (!open.has(route)) {
        expect(responseCodes(item.operation), route).toContain("401");
      }
    }
  });

  it("o esquema Error tem sempre error e message", () => {
    const schema = resolveRef(doc, "#/components/schemas/Error");
    expect(pick(schema, "required")).toEqual(["error", "message"]);
    expect(pick(schema, "properties", "error", "type")).toBe("string");
    expect(pick(schema, "properties", "message", "type")).toBe("string");
  });

  it("os pedidos com valores limitam o montante a 1 000 000 000, como a validação do código", () => {
    for (const name of ["TransferRequest", "MerchantPaymentRequest", "DepositRequest", "WithdrawalRequest"]) {
      expect(pick(doc, "components", "schemas", name, "properties", "amount"), name).toMatchObject({
        type: "integer",
        minimum: 1,
        maximum: 1000000000,
      });
    }
  });
});
