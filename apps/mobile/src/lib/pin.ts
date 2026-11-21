export const PIN_LENGTH = 6;

// Só dígitos ASCII, no máximo 6.
export function sanitizePin(text: string): string {
  return text.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

export function isValidPinFormat(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin);
}

function isSequence(digits: number[], step: 1 | -1): boolean {
  return digits.every((digit, index) => {
    if (index === 0) {
      return true;
    }
    const previous = digits[index - 1];
    return previous !== undefined && digit - previous === step;
  });
}

// Devolve a mensagem do problema, ou null se o PIN for aceitável. As mensagens são as do servidor.
export function pinProblem(pin: string): string | null {
  if (!isValidPinFormat(pin)) {
    return "O PIN deve ter exatamente 6 dígitos.";
  }
  const digits = Array.from(pin, (char) => Number(char));
  if (digits.every((digit) => digit === digits[0])) {
    return "O PIN não pode ter todos os dígitos iguais.";
  }
  if (isSequence(digits, 1) || isSequence(digits, -1)) {
    return "O PIN não pode ser uma sequência de números.";
  }
  if (pin.slice(0, 2).repeat(3) === pin || pin.slice(0, 3).repeat(2) === pin) {
    return "O PIN não pode ser um padrão repetido.";
  }
  return null;
}

// Mensagem de um PIN bloqueado, com o tempo que falta. Sem hora válida, pede para tentar mais tarde.
export function lockedMessage(lockedUntil: string | null | undefined, now: Date = new Date()): string {
  const base = "PIN bloqueado por tentativas falhadas.";
  if (!lockedUntil) {
    return `${base} Tente mais tarde.`;
  }
  const until = Date.parse(lockedUntil);
  if (Number.isNaN(until)) {
    return `${base} Tente mais tarde.`;
  }

  const remaining = until - now.getTime();
  if (remaining <= 0) {
    return "O bloqueio do PIN já terminou. Tente novamente.";
  }

  const minutes = Math.ceil(remaining / 60_000);
  if (minutes <= 120) {
    return `${base} Tente novamente dentro de ${minutes === 1 ? "1 minuto" : `${minutes} minutos`}.`;
  }
  return `${base} Tente novamente dentro de ${Math.ceil(minutes / 60)} horas.`;
}
