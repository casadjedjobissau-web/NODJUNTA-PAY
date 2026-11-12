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

export function parseQrPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return null;
  }
  const code = trimmed.slice(PREFIX.length).toUpperCase();
  return isMerchantCode(code) ? code : null;
}
