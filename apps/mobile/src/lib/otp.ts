// O Supabase envia, por omissão, códigos de 6 dígitos. Se alterar o comprimento no painel,
// altere também esta constante.
export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;

export function sanitizeOtp(text: string): string {
  return text.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function isCompleteOtp(code: string): boolean {
  return new RegExp(`^[0-9]{${OTP_LENGTH}}$`).test(code);
}
