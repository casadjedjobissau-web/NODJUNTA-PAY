export type PaletteKey = "green" | "ink" | "white" | "blue";

export const PALETTE_KEYS: readonly PaletteKey[] = ["green", "ink", "white", "blue"];

export interface Point {
  x: number;
  y: number;
}

export interface RectShape {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: PaletteKey;
}

export interface PolygonShape {
  kind: "polygon";
  points: string;
  color: PaletteKey;
}

export type Shape = RectShape | PolygonShape;

export interface Band {
  tiles: number;
  width: number;
  height: number;
  shapes: Shape[];
}

type Motif = "diamond" | "stripes" | "diamondInverse" | "checker";

const MOTIFS: readonly Motif[] = ["diamond", "stripes", "diamondInverse", "checker"];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function pointsToString(points: readonly Point[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

// Estrela de cinco pontas com uma ponta virada para cima.
export function starPoints(cx: number, cy: number, outer: number, inner: number): Point[] {
  if (!Number.isFinite(outer) || !Number.isFinite(inner) || outer <= 0 || inner <= 0 || inner >= outer) {
    throw new Error("Raios da estrela inválidos");
  }
  const points: Point[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return points;
}

function rect(x: number, y: number, width: number, height: number, color: PaletteKey): RectShape {
  return { kind: "rect", x: round(x), y: round(y), width: round(width), height: round(height), color };
}

function diamond(x: number, cell: number, color: PaletteKey): PolygonShape {
  const inset = cell * 0.15;
  const points: Point[] = [
    { x: x + cell / 2, y: inset },
    { x: x + cell - inset, y: cell / 2 },
    { x: x + cell / 2, y: cell - inset },
    { x: x + inset, y: cell / 2 },
  ];
  return { kind: "polygon", points: pointsToString(points), color };
}

function tileShapes(motif: Motif, x: number, cell: number): Shape[] {
  switch (motif) {
    case "diamond":
      return [rect(x, 0, cell, cell, "ink"), diamond(x, cell, "green")];
    case "diamondInverse":
      return [rect(x, 0, cell, cell, "green"), diamond(x, cell, "ink")];
    case "stripes": {
      const stripe = cell * 0.14;
      return [
        rect(x, 0, cell, cell, "white"),
        rect(x, cell * 0.18, cell, stripe, "blue"),
        rect(x, cell * 0.43, cell, stripe, "blue"),
        rect(x, cell * 0.68, cell, stripe, "blue"),
      ];
    }
    case "checker": {
      const half = cell / 2;
      return [
        rect(x, 0, half, half, "blue"),
        rect(x + half, 0, half, half, "white"),
        rect(x, half, half, half, "white"),
        rect(x + half, half, half, half, "blue"),
      ];
    }
  }
}

// Faixa horizontal de motivos repetidos. A largura é arredondada para cima ao número de módulos.
export function buildBand(width: number, cell: number): Band {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(cell) || cell <= 0) {
    throw new Error("Dimensões da faixa inválidas");
  }
  const tiles = Math.ceil(width / cell);
  const shapes: Shape[] = [];
  for (let index = 0; index < tiles; index += 1) {
    const motif = MOTIFS[index % MOTIFS.length] as Motif;
    shapes.push(...tileShapes(motif, index * cell, cell));
  }
  return { tiles, width: round(tiles * cell), height: cell, shapes };
}
