import { PIN_LENGTH } from "./pin";

// Disposição das teclas: 3 por linha. "" é um espaço vazio e "delete" apaga o último dígito.
export const PIN_KEYS: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"];

export function pressDigit(current: string, digit: string): string {
  if (!/^[0-9]$/.test(digit) || current.length >= PIN_LENGTH) {
    return current;
  }
  return current + digit;
}

export function pressDelete(current: string): string {
  return current.slice(0, -1);
}

export function isComplete(current: string): boolean {
  return current.length === PIN_LENGTH;
}
