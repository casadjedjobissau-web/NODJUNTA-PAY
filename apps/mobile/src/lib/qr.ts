const PREFIX = "NJP1:";
const CODE_PATTERN = /^[0-9A-F]{8}$/;

export function isMerchantCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

export function buildQrPayload(merchantCode: string): string {
  if (!isMerchantCode(merchantCode)) {
    throw new Error("merchantCode inválido");
  }
  return `${PREFIX}${merchantCode}`;
}

// Lê o conteúdo de um QR Code. Devolve o código do comerciante ou null se não for um QR da NÔDJUNTA PAY.
export function parseQrPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return null;
  }
  const code = trimmed.slice(PREFIX.length).toUpperCase();
  return isMerchantCode(code) ? code : null;
}

// Para o código escrito à mão: ignora espaços e maiúsculas/minúsculas.
export function normalizeMerchantCode(input: string): string | null {
  const code = input.replace(/\s/g, "").toUpperCase();
  return isMerchantCode(code) ? code : null;
}
