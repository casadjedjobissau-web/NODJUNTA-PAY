import { normalizeLookupPhone } from "./format";

export type PhoneChangeStatus = "pending" | "approved" | "rejected";

export interface PhoneChangeItem {
  id: string;
  seq: number;
  userId: string;
  fullName: string | null;
  oldPhoneMasked: string | null;
  newPhone: string;
  reason: string;
  evidenceNote: string;
  status: PhoneChangeStatus;
  createdBy: string;
  decidedBy: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface CreatePhoneChangeInput {
  userId: string;
  newPhone: string;
  reason: string;
  evidence: string;
}

export const REASON_MIN = 3;
export const REASON_MAX = 300;
export const EVIDENCE_MIN = 10;
export const EVIDENCE_MAX = 500;

export function statusLabel(status: PhoneChangeStatus): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Recusado";
  }
}

export function statusTone(status: PhoneChangeStatus): "ok" | "warn" | "bad" | "neutral" {
  switch (status) {
    case "pending":
      return "warn";
    case "approved":
      return "ok";
    case "rejected":
      return "bad";
  }
}

// Uma sequência de 6 ou mais dígitos parece um número de documento ou de telefone. Datas com barras passam.
export function containsLongNumber(text: string): boolean {
  return /\d{6,}/.test(text.replace(/[\s.-]/g, ""));
}

export interface CreateErrors {
  newPhone?: string;
  reason?: string;
  evidence?: string;
}

export type CreateValidation =
  | { ok: true; value: { newPhone: string; reason: string; evidence: string } }
  | { ok: false; errors: CreateErrors };

export function validateCreate(input: { newPhoneText: string; reason: string; evidence: string }): CreateValidation {
  const errors: CreateErrors = {};
  const newPhone = normalizeLookupPhone(input.newPhoneText);
  const reason = input.reason.trim();
  const evidence = input.evidence.trim();

  if (newPhone === null) {
    errors.newPhone = "Número inválido. Use +245 e 9 dígitos.";
  }
  if (reason.length < REASON_MIN) {
    errors.reason = `Indique o motivo (mínimo ${REASON_MIN} caracteres).`;
  } else if (reason.length > REASON_MAX) {
    errors.reason = `O motivo pode ter no máximo ${REASON_MAX} caracteres.`;
  }
  if (evidence.length < EVIDENCE_MIN) {
    errors.evidence = `Descreva como a identidade foi verificada (mínimo ${EVIDENCE_MIN} caracteres).`;
  } else if (evidence.length > EVIDENCE_MAX) {
    errors.evidence = `A nota pode ter no máximo ${EVIDENCE_MAX} caracteres.`;
  } else if (containsLongNumber(evidence)) {
    errors.evidence =
      "A nota parece conter um número de documento ou de telefone. Descreva só o método e a data, com barras (14/11/2026).";
  }

  if (Object.keys(errors).length > 0 || newPhone === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { newPhone, reason, evidence } };
}

// Devolve a razão pela qual este administrador não pode decidir, ou null se pode.
export function decideBlock(item: PhoneChangeItem, meId: string): string | null {
  if (item.status !== "pending") {
    return "O pedido já foi decidido.";
  }
  if (item.createdBy === meId) {
    return "Quem abriu o pedido não o pode decidir. Peça a outro administrador.";
  }
  if (item.userId === meId) {
    return "Não pode decidir uma troca de número da sua própria conta.";
  }
  return null;
}

// Devolve a mensagem do problema, ou null se a decisão for válida. Recusar exige motivo.
export function validateDecision(approve: boolean, reason: string): string | null {
  const trimmed = reason.trim();
  if (!approve && trimmed.length === 0) {
    return "Indique o motivo da recusa.";
  }
  if (trimmed.length > REASON_MAX) {
    return `O motivo pode ter no máximo ${REASON_MAX} caracteres.`;
  }
  return null;
}
