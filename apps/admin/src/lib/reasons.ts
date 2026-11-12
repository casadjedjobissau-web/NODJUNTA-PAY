export const MAX_REASON = 300;

// Devolve a mensagem de erro, ou null se o motivo for válido.
export function validateReason(text: string, required: boolean): string | null {
  const trimmed = text.trim();
  if (required && trimmed.length === 0) {
    return "Indique o motivo.";
  }
  if (trimmed.length > MAX_REASON) {
    return `O motivo pode ter no máximo ${MAX_REASON} caracteres.`;
  }
  return null;
}

export function trimReason(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
