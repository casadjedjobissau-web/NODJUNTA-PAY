import { describe, expect, it } from "vitest";
import {
  documentedRoutes,
  findOperation,
  findProblems,
  isAdminRoute,
  isCustomerRoute,
  listOperations,
  normalizeFastifyUrl,
  parameterRefs,
  publicRoutes,
  resolveRef,
  responseCodes,
  type OpenApiDocument,
} from "../testing/openapi.js";

function validDoc(): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: { title: "Teste", version: "1.0.0" },
    security: [{ bearerAuth: [] }],
    tags: [{ name: "Geral" }],
    paths: {
      "/ping": {
        get: {
          operationId: "ping",
          summary: "Ping",
          tags: ["Geral"],
          security: [],
          responses: { "200": { description: "ok" } },
        },
      },
      "/items/{id}": {
        get: {
          operationId: "getItem",
          summary: "Item",
          tags: ["Geral"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "ok" } },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      schemas: { Item: { type: "object" } },
    },
  };
}

function mutate(change: (doc: OpenApiDocument) => void): string[] {
  const doc = structuredClone(validDoc());
  change(doc);
  return findProblems(doc);
}

function operationOf(doc: OpenApiDocument, path: string, method = "get"): Record<string, unknown> {
  const paths = doc.paths as Record<string, Record<string, Record<string, unknown>>>;
  const item = paths[path];
  const operation = item?.[method];
  if (!operation) {
    throw new Error(`operação de teste em falta: ${method} ${path}`);
  }
  return operation;
}

describe("findProblems", () => {
  it("um documento válido não tem problemas", () => {
    expect(findProblems(validDoc())).toEqual([]);
  });

  it("recusa uma versão de OpenAPI inválida ou em falta", () => {
    expect(mutate((doc) => (doc.openapi = "2.0"))[0]).toContain("openapi");
    expect(mutate((doc) => delete doc.openapi)[0]).toContain("openapi");
    expect(mutate((doc) => (doc.openapi = "3.0"))[0]).toContain("openapi");
  });

  it("exige título e versão em info", () => {
    const problems = mutate((doc) => delete doc.info);
    expect(problems).toContain("info.title em falta");
    expect(problems).toContain("info.version em falta");
  });

  it("exige o esquema bearerAuth e a segurança global", () => {
    const noScheme = mutate((doc) => (doc.components = { schemas: {} }));
    expect(noScheme).toContain("components.securitySchemes.bearerAuth em falta");

    const noGlobal = mutate((doc) => delete doc.security);
    expect(noGlobal).toContain("a segurança global tem de exigir bearerAuth");
  });

  it("deteta um $ref sem destino", () => {
    const problems = mutate((doc) => {
      operationOf(doc, "/ping").responses = {
        "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Inexistente" } } } },
      };
    });
    expect(problems).toEqual(["$ref sem destino: #/components/schemas/Inexistente"]);
  });

  it("aceita $ref que resolvem, incluindo caracteres escapados", () => {
    const problems = mutate((doc) => {
      (doc.components as Record<string, unknown>).schemas = { Item: { type: "object" }, "a/b": { type: "object" } };
      operationOf(doc, "/ping").responses = {
        "200": {
          description: "ok",
          content: {
            "application/json": { schema: { allOf: [{ $ref: "#/components/schemas/Item" }, { $ref: "#/components/schemas/a~1b" }] } },
          },
        },
      };
    });
    expect(problems).toEqual([]);
  });

  it("exige operationId em camelCase", () => {
    expect(mutate((doc) => delete operationOf(doc, "/ping").operationId)).toEqual(["GET /ping: operationId em falta ou inválido"]);
    expect(mutate((doc) => (operationOf(doc, "/ping").operationId = "Ping_Invalido"))).toEqual([
      "GET /ping: operationId em falta ou inválido",
    ]);
  });

  it("deteta operationId repetido", () => {
    const problems = mutate((doc) => (operationOf(doc, "/items/{id}").operationId = "ping"));
    expect(problems).toEqual(['GET /items/{id}: operationId "ping" repetido (já usado em GET /ping)']);
  });

  it("exige summary", () => {
    expect(mutate((doc) => delete operationOf(doc, "/ping").summary)).toEqual(["GET /ping: summary em falta"]);
    expect(mutate((doc) => (operationOf(doc, "/ping").summary = "   "))).toEqual(["GET /ping: summary em falta"]);
  });

  it("exige tags declaradas", () => {
    expect(mutate((doc) => delete operationOf(doc, "/ping").tags)).toEqual(["GET /ping: sem tags"]);
    expect(mutate((doc) => (operationOf(doc, "/ping").tags = ["Outra"]))).toEqual([
      "GET /ping: tag não declarada (Outra)",
    ]);
  });

  it("exige uma resposta 2xx", () => {
    expect(mutate((doc) => (operationOf(doc, "/ping").responses = { "404": { description: "não existe" } }))).toEqual([
      "GET /ping: sem resposta 2xx",
    ]);
    expect(mutate((doc) => delete operationOf(doc, "/ping").responses)).toEqual(["GET /ping: sem resposta 2xx"]);
  });

  it("exige que os parâmetros de caminho estejam declarados", () => {
    expect(mutate((doc) => delete operationOf(doc, "/items/{id}").parameters)).toEqual([
      "GET /items/{id}: parâmetro de caminho {id} não declarado",
    ]);
  });

  it("recusa parâmetros de caminho que não aparecem no caminho", () => {
    const problems = mutate((doc) => {
      operationOf(doc, "/ping").parameters = [{ name: "x", in: "path", required: true, schema: { type: "string" } }];
    });
    expect(problems).toEqual(['GET /ping: o parâmetro de caminho "x" não aparece no caminho']);
  });

  it("exige que os parâmetros de caminho sejam obrigatórios", () => {
    const problems = mutate((doc) => {
      operationOf(doc, "/items/{id}").parameters = [{ name: "id", in: "path", required: false, schema: { type: "string" } }];
    });
    expect(problems).toEqual(['GET /items/{id}: o parâmetro de caminho "id" tem de ser obrigatório']);
  });

  it("aceita parâmetros de caminho declarados por $ref", () => {
    const problems = mutate((doc) => {
      (doc.components as Record<string, unknown>).parameters = {
        PathId: { name: "id", in: "path", required: true, schema: { type: "string" } },
      };
      operationOf(doc, "/items/{id}").parameters = [{ $ref: "#/components/parameters/PathId" }];
    });
    expect(problems).toEqual([]);
  });

  it("security vazio torna a rota pública, e um esquema desconhecido é recusado", () => {
    expect(mutate((doc) => (operationOf(doc, "/items/{id}").security = []))).toEqual([]);
    expect(mutate((doc) => (operationOf(doc, "/items/{id}").security = [{ apiKey: [] }]))).toEqual([
      "GET /items/{id}: esquema de segurança desconhecido",
    ]);
    expect(mutate((doc) => (operationOf(doc, "/items/{id}").security = "bearerAuth"))).toEqual([
      "GET /items/{id}: security inválido",
    ]);
  });
});

describe("ferramentas de leitura do documento", () => {
  it("listOperations ignora chaves que não são métodos HTTP e documentedRoutes ordena", () => {
    const doc = validDoc();
    (doc.paths as Record<string, Record<string, unknown>>)["/items/{id}"]!.parameters = [];
    (doc.paths as Record<string, Record<string, unknown>>)["/items/{id}"]!.summary = "texto";

    expect(listOperations(doc)).toHaveLength(2);
    expect(documentedRoutes(doc)).toEqual(["GET /items/{id}", "GET /ping"]);
  });

  it("publicRoutes devolve só as rotas com security vazio", () => {
    expect(publicRoutes(validDoc())).toEqual(["GET /ping"]);
  });

  it("findOperation encontra uma rota e devolve undefined se não existir", () => {
    const doc = validDoc();
    expect(findOperation(doc, "GET /ping")?.operationId).toBe("ping");
    expect(findOperation(doc, "POST /ping")).toBeUndefined();
  });

  it("parameterRefs e responseCodes toleram operações ausentes", () => {
    expect(parameterRefs(undefined)).toEqual([]);
    expect(responseCodes(undefined)).toEqual([]);
    expect(parameterRefs({ parameters: [{ $ref: "#/components/parameters/A" }, { name: "x" }] })).toEqual([
      "#/components/parameters/A",
    ]);
    expect(responseCodes({ responses: { "200": {}, "404": {} } })).toEqual(["200", "404"]);
  });

  it("normalizeFastifyUrl troca :parametro por {parametro}", () => {
    expect(normalizeFastifyUrl("/v1/receipts/:transactionId")).toBe("/v1/receipts/{transactionId}");
    expect(normalizeFastifyUrl("/v1/sandbox/funding-requests/:id/:outcome")).toBe(
      "/v1/sandbox/funding-requests/{id}/{outcome}",
    );
    expect(normalizeFastifyUrl("/v1/wallet")).toBe("/v1/wallet");
  });

  it("resolveRef devolve undefined para referências fora do documento", () => {
    const doc = validDoc();
    expect(resolveRef(doc, "https://exemplo.com/x.yaml#/a")).toBeUndefined();
    expect(resolveRef(doc, "#/components/schemas/Item")).toEqual({ type: "object" });
    expect(resolveRef(doc, "#/components/schemas/Item/type/x")).toBeUndefined();
  });

  it("isCustomerRoute e isAdminRoute separam as rotas de administração", () => {
    expect(isAdminRoute("GET /admin/v1/overview")).toBe(true);
    expect(isAdminRoute("GET /v1/wallet")).toBe(false);
    expect(isCustomerRoute("GET /v1/wallet")).toBe(true);
    expect(isCustomerRoute("POST /webhooks/{provider}")).toBe(true);
    expect(isCustomerRoute("GET /admin/v1/overview")).toBe(false);
  });
});
