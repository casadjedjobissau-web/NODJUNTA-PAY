export interface SupportPhone {
  e164: string;
  display: string;
}

export function formatPhoneDisplay(e164: string): string {
  const match = /^\+245([0-9]{3})([0-9]{3})([0-9]{3})$/.exec(e164);
  return match ? `+245 ${match[1]} ${match[2]} ${match[3]}` : e164;
}

export function toSupportPhones(phones: readonly string[]): SupportPhone[] {
  return phones.map((e164) => ({ e164, display: formatPhoneDisplay(e164) }));
}
