import {
  colors as tokenColors,
  fontSizes,
  radius as tokenRadius,
  spacing as tokenSpacing,
} from "./design/tokens";

// Camada de compatibilidade das telas anteriores ao design system.
// Código novo deve importar diretamente de "./design/tokens".
export const colors = {
  primary: tokenColors.surfaceInverse,
  primaryDark: tokenColors.surfaceInverse,
  accent: tokenColors.brand,
  background: tokenColors.background,
  surface: tokenColors.surface,
  text: tokenColors.textPrimary,
  textMuted: tokenColors.textSecondary,
  border: tokenColors.border,
  danger: tokenColors.error,
  success: tokenColors.brandText,
} as const;

export const spacing = {
  xs: tokenSpacing.xs,
  sm: tokenSpacing.sm,
  md: tokenSpacing.md,
  lg: tokenSpacing.lg,
  xl: tokenSpacing.xl,
} as const;

export const radius = {
  sm: tokenRadius.sm,
  md: tokenRadius.md,
  lg: tokenRadius.lg,
} as const;

export const fontSize = {
  small: fontSizes.small,
  body: fontSizes.body,
  title: fontSizes.title,
  display: fontSizes.display,
} as const;
