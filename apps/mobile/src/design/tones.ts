import { colors, palette } from "./tokens";

export type Tone = "neutral" | "success" | "info" | "warning" | "error";

export interface ToneColors {
  fg: string;
  bg: string;
}

export const TONES: Record<Tone, ToneColors> = {
  neutral: { fg: colors.textPrimary, bg: "#E9EEEB" },
  success: { fg: colors.brandText, bg: colors.brandSoft },
  info: { fg: palette.white, bg: colors.link },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  error: { fg: colors.error, bg: colors.errorSoft },
};

const AVATAR_GREEN: ToneColors = { fg: colors.brandText, bg: colors.brandSoft };
const AVATAR_INK: ToneColors = { fg: palette.white, bg: palette.ink };
const AVATAR_BLUE: ToneColors = { fg: palette.white, bg: palette.blue };

export const AVATAR_TONES: readonly ToneColors[] = [AVATAR_GREEN, AVATAR_INK, AVATAR_BLUE];

export function hashSeed(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 2147483647;
  }
  return hash;
}

// A mesma pessoa tem sempre a mesma cor de avatar.
export function avatarTone(seed: string): ToneColors {
  return AVATAR_TONES[hashSeed(seed) % AVATAR_TONES.length] ?? AVATAR_GREEN;
}

export function toneForStatus(status: string): Tone {
  switch (status) {
    case "completed":
    case "approved":
    case "active":
      return "success";
    case "pending":
    case "draft":
      return "warning";
    case "failed":
    case "rejected":
    case "suspended":
    case "frozen":
      return "error";
    default:
      return "neutral";
  }
}
