import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import type { AccountService } from "../modules/account/account.types.js";
import type { FraudAdminService, FraudService } from "../modules/fraud/fraud.types.js";
import type { NotificationService } from "../modules/notifications/notifications.types.js";
import type { PhoneChangeService } from "../modules/phone-change/phone-change.types.js";
import type { PinService } from "../modules/pin/pin.types.js";
import type { ReceiptService } from "../modules/receipts/receipts.types.js";
import type { ReportService } from "../modules/reports/reports.types.js";
import type { SupportAdminService } from "../modules/support/support.admin.types.js";
import type { SupportService } from "../modules/support/support.types.js";
import type { WebhookService } from "../modules/webhooks/webhooks.types.js";
import { makeFakeAdmin } from "./admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "./fakes.js";

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export type OpenApiDocument = Record<string, unknown>;

export interface DocumentedOperation {
  method: string;
  path: string;
  operation: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Percorre uma cadeia de chaves e devolve o que encontrar, ou undefined.
export function pick(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

export function docsFile(name: string): string {
  return fileURLToPath(new URL(`../../../../docs/${name}`, import.meta.url));
}

export function loadDocument(name: string): OpenApiDocument {
  const parsed: unknown = parse(readFileSync(docsFile(name), "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`O ficheiro ${name} não é um documento YAML válido`);
  }
  return parsed;
}

export function resolveRef(doc: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  let current: unknown = doc;
  for (const rawPart of ref.slice(2).split("/")) {
    const part = rawPart.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function collectRefs(value: unknown, found: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, found);
    }
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") {
        found.push(child);
      } else {
        collectRefs(child, found);
      }
    }
  }
}

export function listOperations(doc: OpenApiDocument): DocumentedOperation[] {
  const items: DocumentedOperation[] = [];
  const paths = isRecord(doc.paths) ? doc.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (isRecord(operation)) {
        items.push({ method: method.toUpperCase(), path, operation });
      }
    }
  }
  return items;
}

export function documentedRoutes(doc: OpenApiDocument): string[] {
  return listOperations(doc)
    .map((item) => `${item.method} ${item.path}`)
    .sort();
}

export function findOperation(doc: OpenApiDocument, route: string): Record<string, unknown> | undefined {
  return listOperations(doc).find((item) => `${item.method} ${item.path}` === route)?.operation;
}

export function parameterRefs(operation: Record<string, unknown> | undefined): string[] {
  const list = operation && Array.isArray(operation.parameters) ? operation.parameters : [];
  return list.flatMap((entry) => (isRecord(entry) && typeof entry.$ref === "string" ? [entry.$ref] : []));
}

export function responseCodes(operation: Record<string, unknown> | undefined): string[] {
  return operation && isRecord(operation.responses) ? Object.keys(operation.responses) : [];
}

// Rotas sem autenticação por token: declaram "security: []".
export function publicRoutes(doc: OpenApiDocument): string[] {
  return listOperations(doc)
    .filter((item) => Array.isArray(item.operation.security) && item.operation.security.length === 0)
    .map((item) => `${item.method} ${item.path}`)
    .sort();
}

export function normalizeFastifyUrl(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function isAdminRoute(route: string): boolean {
  return (route.split(" ")[1] ?? "").startsWith("/admin/v1");
}

export function isCustomerRoute(route: string): boolean {
  return !isAdminRoute(route);
}

function pathParameters(doc: OpenApiDocument, operation: Record<string, unknown>): Map<string, boolean> {
  const declared = new Map<string, boolean>();
  const list = Array.isArray(operation.parameters) ? operation.parameters : [];
  for (const entry of list) {
    const item = isRecord(entry) && typeof entry.$ref === "string" ? resolveRef(doc, entry.$ref) : entry;
    if (isRecord(item) && item.in === "path" && typeof item.name === "string") {
      declared.set(item.name, item.required === true);
    }
  }
  return declared;
}

// Verificações de estrutura. Devolve uma lista de problemas (vazia quando o documento está bem formado).
export function findProblems(doc: OpenApiDocument): string[] {
  const problems: string[] = [];

  if (typeof doc.openapi !== "string" || !/^3\.[01]\.\d+$/.test(doc.openapi)) {
    problems.push("openapi: versão em falta ou inválida (esperado 3.0.x ou 3.1.x)");
  }

  const title = pick(doc, "info", "title");
  const version = pick(doc, "info", "version");
  if (typeof title !== "string" || title.length === 0) {
    problems.push("info.title em falta");
  }
  if (typeof version !== "string" || version.length === 0) {
    problems.push("info.version em falta");
  }

  if (!isRecord(pick(doc, "components", "securitySchemes", "bearerAuth"))) {
    problems.push("components.securitySchemes.bearerAuth em falta");
  }
  if (!Array.isArray(doc.security) || !doc.security.some((entry) => isRecord(entry) && "bearerAuth" in entry)) {
    problems.push("a segurança global tem de exigir bearerAuth");
  }

  const tagNames = new Set<string>();
  if (Array.isArray(doc.tags)) {
    for (const tag of doc.tags) {
      if (isRecord(tag) && typeof tag.name === "string") {
        tagNames.add(tag.name);
      }
    }
  }

  const refs: string[] = [];
  collectRefs(doc, refs);
  for (const ref of new Set(refs)) {
    if (resolveRef(doc, ref) === undefined) {
      problems.push(`$ref sem destino: ${ref}`);
    }
  }

  const seenIds = new Map<string, string>();
  for (const item of listOperations(doc)) {
    const label = `${item.method} ${item.path}`;
    const operation = item.operation;

    const id = operation.operationId;
    if (typeof id !== "string" || !/^[a-z][A-Za-z0-9]*$/.test(id)) {
      problems.push(`${label}: operationId em falta ou inválido`);
    } else {
      const previous = seenIds.get(id);
      if (previous) {
        problems.push(`${label}: operationId "${id}" repetido (já usado em ${previous})`);
      } else {
        seenIds.set(id, label);
      }
    }

    if (typeof operation.summary !== "string" || operation.summary.trim().length === 0) {
      problems.push(`${label}: summary em falta`);
    }

    const tags = Array.isArray(operation.tags) ? operation.tags : [];
    if (tags.length === 0) {
      problems.push(`${label}: sem tags`);
    }
    for (const tag of tags) {
      if (typeof tag !== "string" || !tagNames.has(tag)) {
        problems.push(`${label}: tag não declarada (${String(tag)})`);
      }
    }

    if (!responseCodes(operation).some((code) => /^2\d\d$/.test(code))) {
      problems.push(`${label}: sem resposta 2xx`);
    }

    if (operation.security !== undefined) {
      if (!Array.isArray(operation.security)) {
        problems.push(`${label}: security inválido`);
      } else if (
        operation.security.length > 0 &&
        !operation.security.some((entry) => isRecord(entry) && "bearerAuth" in entry)
      ) {
        problems.push(`${label}: esquema de segurança desconhecido`);
      }
    }

    const inPath = [...item.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? "");
    const declared = pathParameters(doc, operation);
    for (const name of inPath) {
      if (!declared.has(name)) {
        problems.push(`${label}: parâmetro de caminho {${name}} não declarado`);
      }
    }
    for (const [name, required] of declared) {
      if (!inPath.includes(name)) {
        problems.push(`${label}: o parâmetro de caminho "${name}" não aparece no caminho`);
      }
      if (!required) {
        problems.push(`${label}: o parâmetro de caminho "${name}" tem de ser obrigatório`);
      }
    }
  }

  return problems;
}

function stub<T>(): T {
  return {} as T;
}

// Arranca a API com TODOS os módulos ligados e devolve as rotas que ela registou (sem HEAD nem OPTIONS).
export async function registeredRoutes(): Promise<string[]> {
  const found = new Set<string>();
  const env = loadEnv({ ...TEST_ENV, SANDBOX_ENABLED: "true" });

  const app = await buildApp(
    env,
    makeFakeDeps({
      admin: makeFakeAdmin(),
      webhooks: stub<WebhookService>(),
      webhookSecrets: { sandbox: "segredo-de-teste-para-as-rotas" },
      pin: stub<PinService>(),
      notifications: stub<NotificationService>(),
      receipts: stub<ReceiptService>(),
      support: stub<SupportService>(),
      supportAdmin: stub<SupportAdminService>(),
      reports: stub<ReportService>(),
      account: stub<AccountService>(),
      phoneChange: stub<PhoneChangeService>(),
      fraud: stub<FraudService>(),
      fraudAdmin: stub<FraudAdminService>(),
      routeObserver: (route) => {
        if (route.method === "HEAD" || route.method === "OPTIONS") {
          return;
        }
        found.add(`${route.method} ${normalizeFastifyUrl(route.url)}`);
      },
    }),
  );
  await app.close();

  return [...found].sort();
}
