import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { can, permissionsOf, type AdminPermission, type AdminRole } from "../lib/admin-permissions.js";
import { ADMIN_TOKENS, adminAuthenticator, makeFakeAdmin } from "../testing/admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "../testing/fakes.js";
import {
  documentedRoutes,
  findProblems,
  isAdminRoute,
  listOperations,
  loadDocument,
  pick,
  publicRoutes,
  registeredRoutes,
  responseCodes,
  resolveRef,
} from "../testing/openapi.js";

const doc = loadDocument("openapi-admin.yaml");
const customerDoc = loadDocument("openapi.yaml");
const operations = listOperations(doc);

const ROLES: AdminRole[] = ["support", "reviewer", "admin"];
const TOKENS: Record<AdminRole, string> = {
  support: ADMIN_TOKENS.support,
  reviewer: ADMIN_TOKENS.reviewer,
  admin: ADMIN_TOKENS.admin,
};
const KNOWN_PERMISSIONS = new Set<string>(permissionsOf("admin"));
const UUID = "00000000-0000-4000-8000-000000000001";

let app: Awaited<ReturnType<typeof buildApp>>;
let registered: string[] = [];
let counter = 0;

beforeAll(async () => {
  // Os serviços por trás das rotas estão vazios: quem tem a permissão chega ao serviço e recebe um erro 500,
  // e isso basta. O que se testa aqui é só a decisão de permissão (403 ou não).
  app = await buildApp(
    loadEnv(TEST_ENV),
    makeFakeDeps({
      authenticator: adminAuthenticator(),
      admin: makeFakeAdmin(),
      supportAdmin: {} as never,
      reports: {} as never,
      phoneChange: {} as never,
      fraudAdmin: {} as never,
    }),
  );
  registered = (await registeredRoutes()).filter(isAdminRoute);
});
afterAll(async () => {
  await app.close();
});

function permissionOf(operation: Record<string, unknown>): string | undefined {
  const value = operation["x-permission"];
  return typeof value === "string" ? value : undefined;
}

function rolesOf(operation: Record<string, unknown>): string[] {
  const value = operation["x-roles"];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function concretePath(path: string): string {
  return path.replace("{id}", UUID).replace("{code}", "AB12CD34");
}

describe("docs/openapi-admin.yaml (rotas de administração)", () => {
  it("é um documento OpenAPI 3 bem formado", () => {
    expect(findProblems(doc)).toEqual([]);
  });

  it("só descreve rotas de administração", () => {
    for (const route of documentedRoutes(doc)) {
      expect(isAdminRoute(route)).toBe(true);
    }
  });

  it("todas as rotas de administração registadas na API estão documentadas", () => {
    const documented = documentedRoutes(doc);
    expect(registered.filter((route) => !documented.includes(route))).toEqual([]);
  });

  it("todas as rotas documentadas existem na API", () => {
    const documented = documentedRoutes(doc);
    expect(documented.filter((route) => !registered.includes(route))).toEqual([]);
  });

  it("tem 23 operações (um número fixo, para detetar remoções acidentais)", () => {
    expect(operations).toHaveLength(23);
    expect(registered).toHaveLength(23);
  });

  it("nenhuma rota de administração é pública", () => {
    expect(publicRoutes(doc)).toEqual([]);
  });

  it("toda a operação documenta 401 (sem sessão) e 403 (sem permissão ou sem segundo fator)", () => {
    for (const item of operations) {
      expect(responseCodes(item.operation), `${item.method} ${item.path}`).toEqual(
        expect.arrayContaining(["401", "403"]),
      );
    }
  });

  it("toda a operação declara uma permissão que existe", () => {
    for (const item of operations) {
      const permission = permissionOf(item.operation);
      expect(permission, `${item.method} ${item.path}`).toBeDefined();
      expect(KNOWN_PERMISSIONS.has(permission ?? ""), `${item.method} ${item.path}: ${permission}`).toBe(true);
    }
  });

  it("cada permissão existente é exigida por pelo menos uma operação documentada", () => {
    const used = new Set(operations.map((item) => permissionOf(item.operation)));
    expect([...KNOWN_PERMISSIONS].filter((permission) => !used.has(permission))).toEqual([]);
  });

  it("os papéis documentados em cada operação coincidem com os do código", () => {
    for (const item of operations) {
      const permission = permissionOf(item.operation) as AdminPermission;
      const expected = ROLES.filter((role) => can(role, permission));
      expect(rolesOf(item.operation), `${item.method} ${item.path}`).toEqual(expected);
    }
  });
});

describe("as permissões documentadas são as que a API aplica", () => {
  it.each(operations.map((item) => [`${item.method} ${item.path}`, item] as const))("%s", async (_route, item) => {
    const permission = permissionOf(item.operation) as AdminPermission;

    for (const role of ROLES) {
      counter += 1;
      const res = await app.inject({
        method: item.method as "GET" | "POST",
        url: concretePath(item.path),
        headers: {
          authorization: `Bearer ${TOKENS[role]}`,
          "x-forwarded-for": `10.4.${Math.floor(counter / 250)}.${(counter % 250) + 1}`,
        },
        ...(item.method === "POST" ? { payload: {} } : {}),
      });

      if (can(role, permission)) {
        expect(res.statusCode, `${role} devia ter acesso`).not.toBe(403);
        expect(res.statusCode, `${role} devia estar autenticado`).not.toBe(401);
      } else {
        expect(res.statusCode, `${role} não devia ter acesso`).toBe(403);
        expect(res.json().error).toBe("forbidden");
      }
    }
  });
});

describe("coerência entre os dois documentos", () => {
  it("os operationId são únicos entre openapi.yaml e openapi-admin.yaml", () => {
    const ids = [...listOperations(customerDoc), ...operations].map((item) => String(item.operation.operationId));
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(repeated).toEqual([]);
    expect(ids).toHaveLength(39 + 23);
  });

  it("a resposta Forbidden explica o segundo fator (mfa_required)", () => {
    const forbidden = resolveRef(doc, "#/components/responses/Forbidden");
    expect(String(pick(forbidden, "description"))).toContain("mfa_required");
  });

  it("a exportação em CSV documenta o tipo text/csv e os cabeçalhos de download", () => {
    const csv = operations.find((item) => item.path === "/admin/v1/reports/daily.csv");
    const ok = pick(csv?.operation, "responses", "200");
    expect(pick(ok, "content", "text/csv")).toBeDefined();
    expect(pick(ok, "headers", "Content-Disposition")).toBeDefined();
    expect(pick(ok, "headers", "Cache-Control")).toBeDefined();
  });
});
