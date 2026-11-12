import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { KYC_BUCKET } from "../kyc/kyc.service.js";
import type { AuditEntry, AuditService } from "../audit/audit.types.js";
import { createAdminService } from "./admin.service.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;

const ADMIN = "aaaaaaaa-0000-4000-8000-00000000000a";
const OWNER = "11111111-1111-4111-8111-111111111111";
const SUB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FOLDER = `${OWNER}/${SUB}`;

interface Options {
  tables?: Record<string, { single?: unknown; list?: unknown[] }>;
  rpc?: Record<string, Handler>;
  files?: string[];
}

function chain(single: unknown, list: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of ["select", "eq", "order", "limit", "lt"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => ({ data: single, error: null });
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data: list, error: null }).then(resolve, reject);
  return builder;
}

function makeClient(options: Options, events: string[]) {
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const client = {
    from: (table: string) => {
      const entry = options.tables?.[table] ?? {};
      return chain(entry.single ?? null, entry.list ?? []);
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      events.push(`rpc:${fn}`);
      rpcCalls.push({ fn, params });
      const handler = options.rpc?.[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          events.push(`list:${bucket}:${prefix}`);
          return { data: (options.files ?? []).map((name) => ({ name })), error: null };
        },
        createSignedUrl: async (path: string, seconds: number) => {
          events.push(`sign:${path}`);
          return { data: { signedUrl: `https://exemplo.local/${path}?exp=${seconds}` }, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, rpcCalls };
}

function makeAudit(events: string[], fail = false) {
  const entries: AuditEntry[] = [];
  const audit: AuditService = {
    record: async (entry) => {
      events.push(`audit:${entry.action}`);
      if (fail) {
        throw new Error("auditoria indisponível");
      }
      entries.push(entry);
    },
  };
  return { audit, entries };
}

function setup(options: Options = {}, failAudit = false) {
  const events: string[] = [];
  const { client, rpcCalls } = makeClient(options, events);
  const { audit, entries } = makeAudit(events, failAudit);
  return { service: createAdminService(client, audit), events, entries, rpcCalls };
}

const SUBMITTED = { user_id: OWNER, status: "pending" };

describe("getRole", () => {
  it("devolve o papel de um administrador ativo", async () => {
    const { service } = setup({ tables: { admin_users: { single: { role: "reviewer", active: true } } } });
    expect(await service.getRole(ADMIN)).toBe("reviewer");
  });

  it("devolve null se o administrador estiver inativo", async () => {
    const { service } = setup({ tables: { admin_users: { single: { role: "admin", active: false } } } });
    expect(await service.getRole(ADMIN)).toBeNull();
  });

  it("devolve null sem registo", async () => {
    const { service } = setup();
    expect(await service.getRole(ADMIN)).toBeNull();
  });

  it("devolve null para um papel desconhecido", async () => {
    const { service } = setup({ tables: { admin_users: { single: { role: "root", active: true } } } });
    expect(await service.getRole(ADMIN)).toBeNull();
  });
});

describe("resumo e listas", () => {
  it("overview converte as contagens", async () => {
    const { service } = setup({
      rpc: {
        admin_overview: () => ({
          data: [
            {
              pending_kyc: 3,
              pending_merchants: 2,
              pending_funding: 1,
              failed_webhooks: 0,
              frozen_wallets: 4,
            },
          ],
          error: null,
        }),
      },
    });
    expect(await service.overview()).toEqual({
      pendingKyc: 3,
      pendingMerchants: 2,
      pendingFunding: 1,
      failedWebhooks: 0,
      frozenWallets: 4,
    });
  });

  it("listKyc mapeia as linhas e envia o estado e o limite", async () => {
    const { service, rpcCalls } = setup({
      rpc: {
        admin_list_kyc: () => ({
          data: [
            {
              id: SUB,
              user_id: OWNER,
              phone: "+245955000001",
              full_name: null,
              current_level: 0,
              target_level: 1,
              document_type: "id_card",
              status: "pending",
              review_reason: null,
              submitted_at: "2026-11-10T12:00:00.000Z",
              reviewed_at: null,
            },
          ],
          error: null,
        }),
      },
    });
    const items = await service.listKyc("pending", 20);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: SUB,
      userId: OWNER,
      phone: "+245955000001",
      fullName: null,
      targetLevel: 1,
      status: "pending",
    });
    expect(rpcCalls[0]).toEqual({ fn: "admin_list_kyc", params: { p_status: "pending", p_limit: 20 } });
  });

  it("listAudit pagina com cursor", async () => {
    const rowsData = [3, 2, 1].map((id) => ({
      id,
      actor_id: null,
      actor_type: "system",
      action: "TESTE",
      entity_type: null,
      entity_id: null,
      ip: null,
      metadata: {},
      created_at: "2026-11-10T12:00:00.000Z",
    }));
    const { service } = setup({ tables: { audit_logs: { list: rowsData } } });

    const page = await service.listAudit(2);

    expect(page.items.map((item) => item.id)).toEqual([3, 2]);
    expect(page.nextCursor).toBe(2);
  });
});

describe("revisão de KYC", () => {
  it("devolve o estado final", async () => {
    const { service, rpcCalls } = setup({
      rpc: { review_kyc_submission: () => ({ data: "approved", error: null }) },
    });
    expect(await service.reviewKyc(ADMIN, SUB, true, null)).toBe("approved");
    expect(rpcCalls[0]).toEqual({
      fn: "review_kyc_submission",
      params: { p_submission_id: SUB, p_reviewer: ADMIN, p_approve: true, p_reason: null },
    });
  });

  it("NJ017 (rever o próprio pedido) vira 403", async () => {
    const { service } = setup({
      rpc: { review_kyc_submission: () => ({ data: null, error: { code: "NJ017", message: "x" } }) },
    });
    await expect(service.reviewKyc(ADMIN, SUB, true, null)).rejects.toMatchObject({
      code: "not_allowed_on_self",
      httpStatus: 403,
    });
  });

  it("NJ015 (já decidido) vira 409", async () => {
    const { service } = setup({
      rpc: { review_kyc_submission: () => ({ data: null, error: { code: "NJ015", message: "x" } }) },
    });
    await expect(service.reviewKyc(ADMIN, SUB, true, null)).rejects.toMatchObject({
      code: "invalid_state",
      httpStatus: 409,
    });
  });
});

describe("documentos de KYC", () => {
  it("audita ANTES de gerar os links", async () => {
    const { service, events, entries } = setup({
      tables: { kyc_submissions: { single: SUBMITTED } },
      files: ["front", "back", "selfie"],
    });

    await service.kycDocuments(ADMIN, SUB, "10.0.0.1");

    const auditIndex = events.indexOf("audit:ADMIN_KYC_DOCUMENTS_VIEW");
    const firstSign = events.findIndex((event) => event.startsWith("sign:"));
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(firstSign).toBeGreaterThan(auditIndex);
    expect(entries[0]).toMatchObject({
      actorId: ADMIN,
      actorType: "admin",
      entityType: "kyc_submission",
      entityId: SUB,
      ip: "10.0.0.1",
    });
  });

  it("só assina os ficheiros que existem, com validade de 60 segundos", async () => {
    const { service, events } = setup({
      tables: { kyc_submissions: { single: SUBMITTED } },
      files: ["front", "selfie", "lixo.txt"],
    });

    const docs = await service.kycDocuments(ADMIN, SUB, null);

    expect(docs.map((doc) => doc.kind)).toEqual(["front", "selfie"]);
    expect(docs.every((doc) => doc.expiresInSeconds === 60)).toBe(true);
    expect(events).toContain(`list:${KYC_BUCKET}:${FOLDER}`);
    expect(events).toContain(`sign:${FOLDER}/front`);
    expect(events).not.toContain(`sign:${FOLDER}/back`);
  });

  it("pedido em rascunho: 409 e nada é auditado nem assinado", async () => {
    const { service, events } = setup({
      tables: { kyc_submissions: { single: { user_id: OWNER, status: "draft" } } },
      files: ["front"],
    });

    await expect(service.kycDocuments(ADMIN, SUB, null)).rejects.toMatchObject({
      code: "invalid_state",
      httpStatus: 409,
    });
    expect(events.some((event) => event.startsWith("audit:"))).toBe(false);
    expect(events.some((event) => event.startsWith("sign:"))).toBe(false);
  });

  it("pedido inexistente: 404", async () => {
    const { service } = setup();
    await expect(service.kycDocuments(ADMIN, SUB, null)).rejects.toMatchObject({
      code: "submission_not_found",
      httpStatus: 404,
    });
  });

  it("se a auditoria falhar, o acesso é negado e nenhum link é gerado", async () => {
    const { service, events } = setup(
      { tables: { kyc_submissions: { single: SUBMITTED } }, files: ["front"] },
      true,
    );

    await expect(service.kycDocuments(ADMIN, SUB, null)).rejects.toThrow("auditoria indisponível");
    expect(events.some((event) => event.startsWith("sign:"))).toBe(false);
  });
});

describe("procura de utilizadores", () => {
  const row = {
    user_id: OWNER,
    phone: "+245955000002",
    full_name: "Maria Gomes",
    kyc_level: 1,
    wallet_balance: 5000,
    wallet_status: "active",
    merchant_code: null,
    created_at: "2026-11-10T12:00:00.000Z",
  };

  it("encontrado: devolve os dados e audita sem guardar o número", async () => {
    const { service, entries } = setup({
      rpc: { admin_lookup_user: () => ({ data: [row], error: null }) },
    });

    const view = await service.lookupUser(ADMIN, "+245955000002", "10.0.0.1");

    expect(view).toMatchObject({ userId: OWNER, kycLevel: 1, walletBalance: 5000, walletStatus: "active" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "ADMIN_USER_LOOKUP",
      entityId: OWNER,
      metadata: { found: true },
    });
    expect(JSON.stringify(entries[0])).not.toContain("955000002");
  });

  it("não encontrado: devolve null e audita found=false", async () => {
    const { service, entries } = setup({
      rpc: { admin_lookup_user: () => ({ data: [], error: null }) },
    });

    expect(await service.lookupUser(ADMIN, "+245955999999", null)).toBeNull();
    expect(entries[0]).toMatchObject({ entityId: null, metadata: { found: false } });
  });

  it("se a auditoria falhar, nenhum dado pessoal é devolvido", async () => {
    const { service } = setup(
      { rpc: { admin_lookup_user: () => ({ data: [row], error: null }) } },
      true,
    );
    await expect(service.lookupUser(ADMIN, "+245955000002", null)).rejects.toThrow("auditoria indisponível");
  });
});

describe("escritas de administração", () => {
  it("setMerchantStatus: NJ018 vira 404", async () => {
    const { service } = setup({
      rpc: { admin_set_merchant_status: () => ({ data: null, error: { code: "NJ018", message: "x" } }) },
    });
    await expect(service.setMerchantStatus(ADMIN, "AB12CD34", "active")).rejects.toMatchObject({
      code: "not_found",
      httpStatus: 404,
    });
  });

  it("setWalletFrozen repassa os parâmetros à função SQL", async () => {
    const { service, rpcCalls } = setup({
      rpc: { admin_set_wallet_frozen: () => ({ data: "frozen", error: null }) },
    });

    expect(await service.setWalletFrozen(ADMIN, OWNER, true, "suspeita")).toBe("frozen");
    expect(rpcCalls[0]).toEqual({
      fn: "admin_set_wallet_frozen",
      params: { p_admin: ADMIN, p_user_id: OWNER, p_frozen: true, p_reason: "suspeita" },
    });
  });
});
