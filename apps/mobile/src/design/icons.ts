import { starPoints, type Point } from "./patterns";

function format(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// Círculo aproximado por quatro curvas de Bézier.
function circlePath(cx: number, cy: number, r: number): string {
  const k = r * 0.5523;
  return [
    `M${format(cx - r)} ${format(cy)}`,
    `C${format(cx - r)} ${format(cy - k)} ${format(cx - k)} ${format(cy - r)} ${format(cx)} ${format(cy - r)}`,
    `C${format(cx + k)} ${format(cy - r)} ${format(cx + r)} ${format(cy - k)} ${format(cx + r)} ${format(cy)}`,
    `C${format(cx + r)} ${format(cy + k)} ${format(cx + k)} ${format(cy + r)} ${format(cx)} ${format(cy + r)}`,
    `C${format(cx - k)} ${format(cy + r)} ${format(cx - r)} ${format(cy + k)} ${format(cx - r)} ${format(cy)} Z`,
  ].join(" ");
}

function polygonPath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (!first) {
    return "";
  }
  return [
    `M${format(first.x)} ${format(first.y)}`,
    ...rest.map((point) => `L${format(point.x)} ${format(point.y)}`),
    "Z",
  ].join(" ");
}

export const ICONS = {
  home: "M3 11 L12 3 L21 11 V21 H15 V14 H9 V21 H3 Z",
  send: "M7 17 L17 7 M9 7 H17 V15",
  receive: "M17 7 L7 17 M15 17 H7 V9",
  qr: "M3 3 H10 V10 H3 Z M14 3 H21 V10 H14 Z M3 14 H10 V21 H3 Z M14 14 H17 V17 H14 Z M19 14 H21 M14 19 V21 M18 19 H21 V21 H18 Z",
  wallet: "M3 7 H21 V20 H3 Z M3 7 L17 3 V7 M16 13 H21 V16 H16 Z",
  history: `${circlePath(12, 12, 9)} M12 7 V12 L15 14`,
  bell: "M6 17 V11 C6 7.5 8.5 5 12 5 C15.5 5 18 7.5 18 11 V17 L20 19 H4 Z M10 21 H14",
  user: `${circlePath(12, 8, 4)} M4 21 C4 16.5 7.5 14 12 14 C16.5 14 20 16.5 20 21`,
  shield: "M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z M8.5 12 L11 14.5 L15.5 9.5",
  support: "M4 5 H20 V16 H11 L7 20 V16 H4 Z",
  plus: "M12 5 V19 M5 12 H19",
  minus: "M5 12 H19",
  check: "M5 12.5 L10 17.5 L19 7",
  close: "M6 6 L18 18 M18 6 L6 18",
  chevronRight: "M9 5 L16 12 L9 19",
  chevronLeft: "M15 5 L8 12 L15 19",
  eye: `M2 12 C5 6.5 8.5 5 12 5 C15.5 5 19 6.5 22 12 C19 17.5 15.5 19 12 19 C8.5 19 5 17.5 2 12 Z ${circlePath(12, 12, 3)}`,
  eyeOff:
    "M2 12 C5 6.5 8.5 5 12 5 C15.5 5 19 6.5 22 12 C19 17.5 15.5 19 12 19 C8.5 19 5 17.5 2 12 Z M4 4 L20 20",
  lock: "M5 11 H19 V21 H5 Z M8 11 V8 C8 5.5 9.8 4 12 4 C14.2 4 16 5.5 16 8 V11",
  phone: "M7 3 H17 V21 H7 Z M11 18 H13",
  share: "M12 15 V3 M7 8 L12 3 L17 8 M5 12 V20 H19 V12",
  receipt:
    "M5 3 H19 V21 L16.5 19 L14 21 L12 19 L10 21 L7.5 19 L5 21 Z M8.5 8 H15.5 M8.5 12 H15.5",
  store: "M3 9 L5 4 H19 L21 9 Z M4 9 V20 H20 V9 M10 20 V14 H14 V20",
  settings: `M4 7 H20 M4 17 H20 ${circlePath(9, 7, 2.5)} ${circlePath(15, 17, 2.5)}`,
  camera: `M3 8 H7 L9 5 H15 L17 8 H21 V19 H3 Z ${circlePath(12, 13, 3.5)}`,
  warning: "M12 3 L22 20 H2 Z M12 10 V14 M12 17 H12.5",
  info: `${circlePath(12, 12, 9)} M12 11 V16 M12 8 H12.5`,
  star: polygonPath(starPoints(12, 12.5, 10, 4)),
} satisfies Record<string, string>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

// Ícones desenhados a cheio (os restantes são traços).
export const FILLED_ICONS: ReadonlySet<IconName> = new Set<IconName>(["star"]);

export const ICON_GRID = 24;
