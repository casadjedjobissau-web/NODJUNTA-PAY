const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function clean(input: string): string {
  const compact = input.replace(/\s/g, "").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(compact) || compact.length % 4 === 1) {
    throw new Error("base64 inválido");
  }
  return compact;
}

// Tamanho em bytes dos dados descodificados.
export function base64ByteLength(input: string): number {
  return Math.floor((clean(input).length * 3) / 4);
}

export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const compact = clean(input);
  const bytes = new Uint8Array(Math.floor((compact.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of compact) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
      buffer &= (1 << bits) - 1;
    }
  }
  return bytes.buffer;
}
