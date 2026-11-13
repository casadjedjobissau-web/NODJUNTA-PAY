export const PIN_LENGTH = 6;

export function isValidPinFormat(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin);
}

function digitsOf(pin: string): number[] {
  return Array.from(pin, (char) => Number(char));
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

// Devolve a mensagem do problema, ou null se o PIN for aceitável.
export function pinProblem(pin: string): string | null {
  if (!isValidPinFormat(pin)) {
    return "O PIN deve ter exatamente 6 dígitos.";
  }
  const digits = digitsOf(pin);
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
