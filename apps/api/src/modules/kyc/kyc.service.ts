import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KycError,
  type KycDocumentKind,
  type KycDocumentType,
  type KycService,
  type KycStatusView,
  type KycSubmissionStatus,
  type KycSubmissionView,
  type UploadTarget,
} from "./kyc.types.js";

export const KYC_BUCKET = "kyc-documents";

interface SubmissionRow {
  id: string;
  target_level: number;
  document_type: string;
  status: string;
  review_reason: string | null;
  submitted_at: string | null;
  created_at: string;
}

interface RpcError {
  code?: string;
  message: string;
}

const COLUMNS = "id, target_level, document_type, status, review_reason, submitted_at, created_at";

function toDocumentType(value: string): KycDocumentType {
  if (value === "passport" || value === "other") {
    return value;
  }
  return "id_card";
}

function toStatus(value: string): KycSubmissionStatus {
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }
  return "draft";
}

function toView(row: SubmissionRow): KycSubmissionView {
  return {
    id: row.id,
    targetLevel: Number(row.target_level),
    documentType: toDocumentType(row.document_type),
    status: toStatus(row.status),
    reviewReason: row.review_reason,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  };
}

function mapRpcError(error: RpcError): Error {
  switch (error.code) {
    case "NJ013":
      return new KycError(
        "invalid_target_level",
        422,
        "O nível pedido tem de ser superior ao seu nível atual.",
      );
    case "NJ014":
      return new KycError("submission_open", 409, "Já existe um pedido de verificação em aberto.");
    case "NJ015":
      return new KycError("invalid_state", 409, "O pedido já não permite esta operação.");
    case "NJ016":
      return new KycError("submission_not_found", 404, "Pedido de verificação não encontrado.");
    case "NJ001":
      return new KycError("invalid_request", 400, "Dados do pedido inválidos.");
    default:
      return new Error(`Falha na verificação de identidade: ${error.message}`);
  }
}

export function createKycService(client: SupabaseClient): KycService {
  async function readOwned(userId: string, submissionId: string): Promise<KycSubmissionView | null> {
    const { data, error } = await client
      .from("kyc_submissions")
      .select(COLUMNS)
      .eq("id", submissionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new Error(`Falha ao ler pedido de verificação: ${error.message}`);
    }
    return data ? toView(data as SubmissionRow) : null;
  }

  async function mustReadOwned(userId: string, submissionId: string): Promise<KycSubmissionView> {
    const view = await readOwned(userId, submissionId);
    if (!view) {
      throw new KycError("submission_not_found", 404, "Pedido de verificação não encontrado.");
    }
    return view;
  }

  async function getStatus(userId: string): Promise<KycStatusView> {
    const profile = await client
      .from("profiles")
      .select("kyc_level")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile.error) {
      throw new Error(`Falha ao ler perfil: ${profile.error.message}`);
    }
    const kycLevel = profile.data ? Number((profile.data as { kyc_level: number }).kyc_level) : 0;

    const latest = await client
      .from("kyc_submissions")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (latest.error) {
      throw new Error(`Falha ao ler pedidos de verificação: ${latest.error.message}`);
    }
    const rows = (latest.data ?? []) as SubmissionRow[];
    const first = rows[0];
    return { kycLevel, submission: first ? toView(first) : null };
  }

  async function createSubmission(
    userId: string,
    targetLevel: number,
    documentType: KycDocumentType,
  ): Promise<KycSubmissionView> {
    const created = await client.rpc("create_kyc_submission", {
      p_user_id: userId,
      p_target_level: targetLevel,
      p_document_type: documentType,
    });
    if (created.error) {
      throw mapRpcError(created.error);
    }
    if (typeof created.data !== "string") {
      throw new Error("Resposta inesperada de create_kyc_submission");
    }
    return mustReadOwned(userId, created.data);
  }

  async function createUploadTargets(
    userId: string,
    submissionId: string,
    kinds: KycDocumentKind[],
  ): Promise<UploadTarget[]> {
    const submission = await mustReadOwned(userId, submissionId);
    if (submission.status !== "draft") {
      throw new KycError("invalid_state", 409, "O pedido já foi submetido.");
    }

    const targets: UploadTarget[] = [];
    for (const kind of kinds) {
      const path = `${userId}/${submissionId}/${kind}`;
      const { data, error } = await client.storage
        .from(KYC_BUCKET)
        .createSignedUploadUrl(path, { upsert: true });
      if (error || !data) {
        throw new Error(`Falha ao criar URL de envio: ${error?.message ?? "sem dados"}`);
      }
      targets.push({ kind, path, token: data.token, signedUrl: data.signedUrl });
    }
    return targets;
  }

  async function submit(userId: string, submissionId: string): Promise<KycSubmissionView> {
    const submission = await mustReadOwned(userId, submissionId);
    if (submission.status === "pending") {
      return submission;
    }
    if (submission.status !== "draft") {
      throw new KycError("invalid_state", 409, "O pedido já não permite esta operação.");
    }

    const listed = await client.storage.from(KYC_BUCKET).list(`${userId}/${submissionId}`);
    if (listed.error) {
      throw new Error(`Falha ao listar documentos: ${listed.error.message}`);
    }
    const present = new Set((listed.data ?? []).map((file) => file.name));

    const required: KycDocumentKind[] = ["front", "selfie"];
    if (submission.documentType === "id_card") {
      required.push("back");
    }
    const missing = required.filter((kind) => !present.has(kind));
    if (missing.length > 0) {
      throw new KycError(
        "missing_documents",
        422,
        `Faltam documentos: ${missing.join(", ")}.`,
      );
    }

    const result = await client.rpc("submit_kyc_submission", {
      p_submission_id: submissionId,
      p_user_id: userId,
    });
    if (result.error) {
      throw mapRpcError(result.error);
    }
    return mustReadOwned(userId, submissionId);
  }

  return { getStatus, createSubmission, createUploadTargets, submit };
}
