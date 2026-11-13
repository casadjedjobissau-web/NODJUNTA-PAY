export const palette = {
  green: "#16A765",
  ink: "#101820",
  white: "#FFFFFF",
  blue: "#1769D2",
  greenDeep: "#0E7A47",
  greenSoft: "#E3F5EC",
  blueSoft: "#E6F0FB",
  paper: "#F6F8F7",
} as const;

export const colors = {
  background: palette.paper,
  surface: palette.white,
  surfaceInverse: palette.ink,

  textPrimary: palette.ink,
  textSecondary: "#5F6B64",
  textOnInverse: palette.white,
  textOnBrand: palette.ink,

  brand: palette.green,
  brandText: palette.greenDeep,
  brandSoft: palette.greenSoft,

  link: palette.blue,
  linkSoft: palette.blueSoft,

  border: "#DCE3DF",
  borderStrong: "#B9C4BE",

  error: "#B3261E",
  errorSoft: "#FDECEA",
  warning: "#8A5A00",
  warningSoft: "#FFF4D9",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const fontSizes = {
  caption: 12,
  small: 13,
  body: 16,
  bodyLarge: 18,
  title: 22,
  headline: 26,
  display: 32,
} as const;

export const lineHeights = {
  caption: 16,
  small: 18,
  body: 22,
  bodyLarge: 26,
  title: 28,
  headline: 32,
  display: 38,
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
} as const;

export const shadows = {
  card: {
    shadowColor: palette.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  raised: {
    shadowColor: palette.ink,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export const motion = {
  fast: 120,
  base: 220,
  slow: 360,
} as const;

export interface TextPair {
  name: string;
  fg: string;
  bg: string;
  min: 3 | 4.5;
}

// Todas as combinações de texto aprovadas. Os testes confirmam o contraste mínimo de cada uma.
// Qualquer nova combinação de texto deve ser acrescentada aqui antes de ser usada.
export const textPairs: readonly TextPair[] = [
  { name: "texto principal sobre branco", fg: colors.textPrimary, bg: colors.surface, min: 4.5 },
  { name: "texto principal sobre fundo", fg: colors.textPrimary, bg: colors.background, min: 4.5 },
  { name: "texto principal sobre verde suave", fg: colors.textPrimary, bg: colors.brandSoft, min: 4.5 },
  { name: "texto de botão sobre verde de marca", fg: colors.textOnBrand, bg: colors.brand, min: 4.5 },
  { name: "texto branco sobre fundo escuro", fg: colors.textOnInverse, bg: colors.surfaceInverse, min: 4.5 },
  { name: "verde de marca sobre fundo escuro", fg: colors.brand, bg: colors.surfaceInverse, min: 4.5 },
  { name: "texto branco sobre azul", fg: palette.white, bg: colors.link, min: 4.5 },
  { name: "link azul sobre branco", fg: colors.link, bg: colors.surface, min: 4.5 },
  { name: "link azul sobre fundo", fg: colors.link, bg: colors.background, min: 4.5 },
  { name: "verde de texto sobre branco", fg: colors.brandText, bg: colors.surface, min: 4.5 },
  { name: "verde de texto sobre fundo", fg: colors.brandText, bg: colors.background, min: 4.5 },
  { name: "verde de texto sobre verde suave", fg: colors.brandText, bg: colors.brandSoft, min: 4.5 },
  { name: "texto secundário sobre branco", fg: colors.textSecondary, bg: colors.surface, min: 4.5 },
  { name: "texto secundário sobre fundo", fg: colors.textSecondary, bg: colors.background, min: 4.5 },
  { name: "erro sobre branco", fg: colors.error, bg: colors.surface, min: 4.5 },
  { name: "erro sobre erro suave", fg: colors.error, bg: colors.errorSoft, min: 4.5 },
  { name: "aviso sobre branco", fg: colors.warning, bg: colors.surface, min: 4.5 },
  { name: "aviso sobre aviso suave", fg: colors.warning, bg: colors.warningSoft, min: 4.5 },
];
