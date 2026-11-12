import { ApiError } from "./api-client";
import { userMessage } from "./errors";
import type { KycDocumentType, KycSubmissionStatus } from "./types";

export type KycKind = "front" | "back" | "selfie";

export const KYC_BUCKET = "kyc-documents";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// O bilhete de identidade tem frente e verso; o passaporte só a página de dados.
export function requiredKinds(documentType: KycDocumentType): KycKind[] {
  return documentType === "id_card" ? ["front", "back", "selfie"] : ["front", "selfie"];
}

export function kindLabel(kind: KycKind): string {
  switch (kind) {
    case "front":
      return "Frente do documento";
    case "back":
      return "Verso do documento";
    case "selfie":
      return "Selfie";
  }
}

export function documentTypeLabel(documentType: KycDocumentType): string {
  switch (documentType) {
    case "id_card":
      return "Bilhete de identidade";
    case "passport":
      return "Passaporte";
    case "other":
      return "Outro documento";
  }
}

export function nextLevel(level: number): number | null {
  return level < 3 ? level + 1 : null;
}

export function submissionStatusLabel(status: KycSubmissionStatus): string {
  switch (status) {
    case "draft":
      return "Por completar";
    case "pending":
      return "Em análise";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Recusado";
  }
}

// O bucket só aceita JPEG e PNG. Sem tipo indicado, a câmara entrega JPEG.
export function photoContentType(mimeType: string | null | undefined): string | null {
  if (mimeType === undefined || mimeType === null || mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return "image/jpeg";
  }
  if (mimeType === "image/png") {
    return "image/png";
  }
  return null;
}

export function kycErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "missing_documents") {
    return "Faltam fotografias. Tire todas as fotos pedidas e tente submeter de novo.";
  }
  return userMessage(error);
}
