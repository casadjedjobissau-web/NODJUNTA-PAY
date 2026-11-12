import type { AdminRole, KycDocumentKind, KycStatus, MerchantStatus } from "./types";

const NBSP = "\u00A0";

// XOF não tem subunidade: todos os valores são inteiros em francos.
export function formatAmount(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.trunc(Math.abs(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatMoney(value: number, currency = "XOF"): string {
  return `${formatAmount(value)}${NBSP}${currency}`;
}

// dd/mm/aaaa hh:mm na hora local do navegador.
export function formatDateTime(iso: string | null): string {
  if (iso === null) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatPhone(e164: string | null): string {
  if (e164 === null) {
    return "—";
  }
  const match = /^\+245([0-9]{3})([0-9]{3})([0-9]{3})$/.exec(e164);
  return match ? `+245 ${match[1]} ${match[2]} ${match[3]}` : e164;
}

// Aceita "955000002", "245955000002", "+245 955 000 002" ou "00245955000002".
// Devolve o formato internacional (+245 e 9 dígitos) ou null.
export function normalizeLookupPhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  let hasPrefix = false;
  let digits = compact;

  if (compact.startsWith("+")) {
    hasPrefix = true;
    digits = compact.slice(1);
  } else if (compact.startsWith("00")) {
    hasPrefix = true;
    digits = compact.slice(2);
  }

  if (!/^[0-9]+$/.test(digits)) {
    return null;
  }
  if (digits.length === 12 && digits.startsWith("245")) {
    return `+${digits}`;
  }
  if (!hasPrefix && digits.length === 9) {
    return `+245${digits}`;
  }
  return null;
}

export function kycStatusLabel(status: KycStatus): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Recusado";
  }
}

export function documentTypeLabel(type: string): string {
  switch (type) {
    case "id_card":
      return "Bilhete de identidade";
    case "passport":
      return "Passaporte";
    case "other":
      return "Outro documento";
    default:
      return type;
  }
}

export function kindLabel(kind: KycDocumentKind): string {
  switch (kind) {
    case "front":
      return "Frente do documento";
    case "back":
      return "Verso do documento";
    case "selfie":
      return "Selfie";
  }
}

export function merchantStatusLabel(status: MerchantStatus): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "active":
      return "Ativo";
    case "suspended":
      return "Suspenso";
  }
}

export function walletStatusLabel(status: string | null): string {
  switch (status) {
    case "active":
      return "Ativa";
    case "frozen":
      return "Congelada";
    case "closed":
      return "Encerrada";
    default:
      return "—";
  }
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case "support":
      return "Suporte";
    case "reviewer":
      return "Revisor";
    case "admin":
      return "Administrador";
  }
}
