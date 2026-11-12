import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminRole, type AdminRole } from "../../lib/admin-permissions.js";
import type { AuditService } from "../audit/audit.types.js";
import { KYC_BUCKET } from "../kyc/kyc.service.js";
import {
  AdminError,
  type AdminAuditItem,
  type AdminAuditPage,
  type AdminKycDocument,
  type AdminKycItem,
  type AdminMerchantItem,
  type AdminOverview,
  type AdminService,
  type AdminUserView,
  type KycReviewStatus,
  type MerchantAdminStatus,
} from "./admin.types.js";

const SIGNED_URL_SECONDS = 60;
const DOCUMENT_KINDS: Array<AdminKycDocument["kind"]> = ["front", "back", "selfie"];

interface RpcError {
  code?: string;
  message: string;
}

type Row = Record<string, unknown>;

function rows(data: unknown): Row[] {
  if (Array.isArray(data)) {
    return data as Row[];
  }
  return data ? [data as Row] : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

function toKycStatus(value: unknown): KycReviewStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

function toMerchantStatus(value: unknown): MerchantAdminStatus {
  return value === "active" || value === "suspended" ? value : "pending";
}

function mapRpcError(error: RpcError): Error {
  switch (error.code) {
    case "NJ001":
      return new AdminError(
        "invalid_request",
        400,
        "Dados inválidos. Recusar ou congelar exige um motivo.",
      );
    case "NJ015":
      return new AdminError("invalid_state", 409, "O pedido já não está pendente.");
    case "NJ016":
      return new AdminError("submission_not_found", 404, "Pedido de verificação não encontrado.");
    case "NJ017":
      return new AdminError("not_allowed_on_self", 403, "Não pode executar esta ação sobre a sua própria conta.");
    case "NJ018":
      return new AdminError("not_found", 404, "Registo não encontrado.");
    default:
      return new Error(`Falha na operação de administração: ${error.message}`);
  }
}

export function createAdminService(client: SupabaseClient, audit: AuditService): AdminService {
  async function getRole(userId: string): Promise<AdminRole | null> {
    const { data, error } = await client
      .from("admin_users")
      .select("role, active")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new Error(`Falha ao ler papel de administrador: ${error.message}`);
    }
    if (!data) {
      return null;
    }
    const row = data as { role: unknown; active: unknown };
    if (row.active !== true) {
      return null;
    }
    return isAdminRole(row.role) ? row.role : null;
  }

  async function overview(): Promise<AdminOverview> {
    const { data, error } = await client.rpc("admin_overview");
    if (error) {
      throw new Error(`Falha ao ler o resumo: ${error.message}`);
    }
    const row = rows(data)[0] ?? {};
    return {
      pendingKyc: num(row.pending_kyc),
      pendingMerchants: num(row.pending_merchants),
      pendingFunding: num(row.pending_funding),
      failedWebhooks: num(row.failed_webhooks),
      frozenWallets: num(row.frozen_wallets),
    };
  }

  async function listKyc(status: KycReviewStatus, limit: number): Promise<AdminKycItem[]> {
    const { data, error } = await client.rpc("admin_list_kyc", { p_status: status, p_limit: limit });
    if (error) {
      throw new Error(`Falha ao listar pedidos de KYC: ${error.message}`);
    }
    return rows(data).map((row) => ({
      id: text(row.id),
      userId: text(row.user_id),
      phone: str(row.phone),
      fullName: str(row.full_name),
      currentLevel: num(row.current_level),
      targetLevel: num(row.target_level),
      documentType: text(row.document_type),
      status: toKycStatus(row.status),
      reviewReason: str(row.review_reason),
      submittedAt: str(row.submitted_at),
      reviewedAt: str(row.reviewed_at),
    }));
  }

  async function kycDocuments(
    adminId: string,
    submissionId: string,
    ip: string | null,
  ): Promise<AdminKycDocument[]> {
    const found = await client
      .from("kyc_submissions")
      .select("user_id, status")
      .eq("id", submissionId)
      .maybeSingle();
    if (found.error) {
      throw new Error(`Falha ao ler pedido de KYC: ${found.error.message}`);
    }
    if (!found.data) {
      throw new AdminError("submission_not_found", 404, "Pedido de verificação não encontrado.");
    }
    const submission = found.data as { user_id: string; status: string };
    if (submission.status === "draft") {
      throw new AdminError("invalid_state", 409, "O pedido ainda não foi submetido.");
    }

    const folder = `${submission.user_id}/${submissionId}`;
    const listed = await client.storage.from(KYC_BUCKET).list(folder);
    if (listed.error) {
      throw new Error(`Falha ao listar documentos: ${listed.error.message}`);
    }
    const present = new Set((listed.data ?? []).map((file) => file.name));

    // O acesso a documentos de identidade é auditado ANTES de entregar os links.
    // Se a auditoria falhar, o acesso é negado.
    await audit.record({
      actorId: adminId,
      actorType: "admin",
      action: "ADMIN_KYC_DOCUMENTS_VIEW",
      entityType: "kyc_submission",
      entityId: submissionId,
      ip,
      metadata: {},
    });

    const documents: AdminKycDocument[] = [];
    for (const kind of DOCUMENT_KINDS) {
      if (!present.has(kind)) {
        continue;
      }
      const signed = await client.storage
        .from(KYC_BUCKET)
        .createSignedUrl(`${folder}/${kind}`, SIGNED_URL_SECONDS);
      if (signed.error || !signed.data) {
        throw new Error(`Falha ao gerar link do documento: ${signed.error?.message ?? "sem dados"}`);
      }
      documents.push({ kind, url: signed.data.signedUrl, expiresInSeconds: SIGNED_URL_SECONDS });
    }
    return documents;
  }

  async function reviewKyc(
    adminId: string,
    submissionId: string,
    approve: boolean,
    reason: string | null,
  ): Promise<"approved" | "rejected"> {
    const { data, error } = await client.rpc("review_kyc_submission", {
      p_submission_id: submissionId,
      p_reviewer: adminId,
      p_approve: approve,
      p_reason: reason,
    });
    if (error) {
      throw mapRpcError(error);
    }
    if (data !== "approved" && data !== "rejected") {
      throw new Error("Resposta inesperada de review_kyc_submission");
    }
    return data;
  }

  async function listMerchants(
    status: MerchantAdminStatus | null,
    limit: number,
  ): Promise<AdminMerchantItem[]> {
    const { data, error } = await client.rpc("admin_list_merchants", {
      p_status: status,
      p_limit: limit,
    });
    if (error) {
      throw new Error(`Falha ao listar comerciantes: ${error.message}`);
    }
    return rows(data).map((row) => ({
      merchantCode: text(row.merchant_code),
      businessName: text(row.business_name),
      ownerId: text(row.owner_id),
      ownerPhone: str(row.owner_phone),
      status: toMerchantStatus(row.status),
      createdAt: text(row.created_at),
    }));
  }

  async function setMerchantStatus(
    adminId: string,
    merchantCode: string,
    status: "active" | "suspended",
  ): Promise<"active" | "suspended"> {
    const { data, error } = await client.rpc("admin_set_merchant_status", {
      p_admin: adminId,
      p_merchant_code: merchantCode,
      p_status: status,
    });
    if (error) {
      throw mapRpcError(error);
    }
    if (data !== "active" && data !== "suspended") {
      throw new Error("Resposta inesperada de admin_set_merchant_status");
    }
    return data;
  }

  async function lookupUser(
    adminId: string,
    phone: string,
    ip: string | null,
  ): Promise<AdminUserView | null> {
    const { data, error } = await client.rpc("admin_lookup_user", { p_phone: phone });
    if (error) {
      throw new Error(`Falha ao procurar utilizador: ${error.message}`);
    }
    const row = rows(data)[0];
    const view: AdminUserView | null = row
      ? {
          userId: text(row.user_id),
          phone: str(row.phone),
          fullName: str(row.full_name),
          kycLevel: num(row.kyc_level),
          walletBalance: row.wallet_balance === null || row.wallet_balance === undefined ? null : num(row.wallet_balance),
          walletStatus: str(row.wallet_status),
          merchantCode: str(row.merchant_code),
          createdAt: text(row.created_at),
        }
      : null;

    // Procurar dados pessoais é auditado (sem guardar o número) antes de os devolver.
    await audit.record({
      actorId: adminId,
      actorType: "admin",
      action: "ADMIN_USER_LOOKUP",
      entityType: "user",
      entityId: view ? view.userId : null,
      ip,
      metadata: { found: view !== null },
    });

    return view;
  }

  async function setWalletFrozen(
    adminId: string,
    userId: string,
    frozen: boolean,
    reason: string | null,
  ): Promise<"frozen" | "active"> {
    const { data, error } = await client.rpc("admin_set_wallet_frozen", {
      p_admin: adminId,
      p_user_id: userId,
      p_frozen: frozen,
      p_reason: reason,
    });
    if (error) {
      throw mapRpcError(error);
    }
    if (data !== "frozen" && data !== "active") {
      throw new Error("Resposta inesperada de admin_set_wallet_frozen");
    }
    return data;
  }

  async function listAudit(limit: number, before?: number): Promise<AdminAuditPage> {
    let query = client
      .from("audit_logs")
      .select("id, actor_id, actor_type, action, entity_type, entity_id, ip, metadata, created_at")
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (before !== undefined) {
      query = query.lt("id", before);
    }
    const result = await query;
    if (result.error) {
      throw new Error(`Falha ao ler a auditoria: ${result.error.message}`);
    }

    const all = ((result.data ?? []) as Row[]).map(
      (row): AdminAuditItem => ({
        id: num(row.id),
        actorId: str(row.actor_id),
        actorType: text(row.actor_type),
        action: text(row.action),
        entityType: str(row.entity_type),
        entityId: str(row.entity_id),
        ip: str(row.ip),
        metadata:
          typeof row.metadata === "object" && row.metadata !== null
            ? (row.metadata as Record<string, unknown>)
            : {},
        createdAt: text(row.created_at),
      }),
    );
    const hasMore = all.length > limit;
    const items = hasMore ? all.slice(0, limit) : all;
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? last.id : null };
  }

  return {
    getRole,
    overview,
    listKyc,
    kycDocuments,
    reviewKyc,
    listMerchants,
    setMerchantStatus,
    lookupUser,
    setWalletFrozen,
    listAudit,
  };
}
