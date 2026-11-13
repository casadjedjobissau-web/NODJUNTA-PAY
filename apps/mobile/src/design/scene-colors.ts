import { palette } from "./tokens";

export type SceneVariant = "dark" | "light";

export interface SceneColors {
  sky: string;
  star: string;
  canopy: string;
  trunk: string;
  hillNear: string;
  hillFar: string;
  water: string;
  boatHull: string;
  boatSail: string;
  stone: string;
  opening: string;
}

export function sceneColors(variant: SceneVariant): SceneColors {
  if (variant === "dark") {
    return {
      sky: palette.ink,
      star: palette.white,
      canopy: palette.green,
      trunk: palette.white,
      hillNear: palette.green,
      hillFar: palette.greenDeep,
      water: palette.blue,
      boatHull: palette.white,
      boatSail: palette.white,
      stone: palette.white,
      opening: palette.ink,
    };
  }
  return {
    sky: palette.greenSoft,
    star: palette.ink,
    canopy: palette.greenDeep,
    trunk: palette.ink,
    hillNear: palette.green,
    hillFar: palette.greenDeep,
    water: palette.blue,
    boatHull: palette.ink,
    boatSail: palette.white,
    stone: palette.ink,
    opening: palette.greenSoft,
  };
}

// Ilustração decorativa fica escondida dos leitores de ecrã; com `label`, é anunciada como imagem.
export function artAccessibility(label?: string) {
  if (label) {
    return { accessibilityRole: "image" as const, accessibilityLabel: label };
  }
  return {
    accessibilityElementsHidden: true,
    importantForAccessibility: "no-hide-descendants" as const,
  };
}
