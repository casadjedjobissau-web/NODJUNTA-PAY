import { ApiError } from "./api-client";
import { pinErrorKind } from "./pin-errors";

export const CONFIRM_WORD = "ELIMINAR";

export interface DeletionBlocker {
  code: string;
  message: string;
}

export interface DeletionCheck {
  canDelete: boolean;
  alreadyDeleted: boolean;
  blockers: DeletionBlocker[];
}

// Aceita maiúsculas, minúsculas e espaços à volta. O pedido à API leva sempre a palavra exata.
export function isConfirmed(text: string): boolean {
  return text.trim().toUpperCase() === CONFIRM_WORD;
}

export interface BlockerAction {
  label: string;
  href: "/withdraw" | "/funding" | "/support";
}

// O que o utilizador pode fazer para resolver cada bloqueio. Contas de administração não têm saída aqui.
export function blockerAction(code: string): BlockerAction | null {
  switch (code) {
    case "balance":
      return { label: "Levantar o saldo", href: "/withdraw" };
    case "pending_requests":
      return { label: "Ver pedidos pendentes", href: "/funding" };
    case "frozen":
      return { label: "Contactar o suporte", href: "/support" };
    default:
      return null;
  }
}

export type DeletionFailure = "needs_login" | "blocked" | "pin" | "other";

const BLOCKED_CODES: ReadonlySet<string> = new Set([
  "balance_not_zero",
  "pending_requests",
  "account_frozen",
  "admin_account",
]);

export function classifyDeletionError(error: unknown): DeletionFailure {
  if (pinErrorKind(error) !== null) {
    return "pin";
  }
  if (error instanceof ApiError) {
    if (error.code === "recent_login_required") {
      return "needs_login";
    }
    if (BLOCKED_CODES.has(error.code)) {
      return "blocked";
    }
  }
  return "other";
}
