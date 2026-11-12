const COUNTRY = "245";

// Aceita "955000002", "245955000002", "+245 955 000 002" ou "00245955000002".
// Devolve o formato internacional (+245 e 9 dígitos) ou null se não for válido.
export function normalizeGwPhone(input: string): string | null {
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

  if (digits.length === 12 && digits.startsWith(COUNTRY)) {
    return `+${digits}`;
  }
  if (!hasPrefix && digits.length === 9) {
    return `+${COUNTRY}${digits}`;
  }
  return null;
}

export function formatPhone(e164: string): string {
  const match = /^\+245([0-9]{3})([0-9]{3})([0-9]{3})$/.exec(e164);
  if (!match) {
    return e164;
  }
  return `+245 ${match[1]} ${match[2]} ${match[3]}`;
}
