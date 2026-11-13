export interface RectSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertPositive(...values: number[]): void {
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Dimensões inválidas");
    }
  }
}

// Ameias de uma muralha: retângulos iguais sobre a linha y, dentro da largura indicada.
export function crenellations(
  x: number,
  y: number,
  width: number,
  merlonWidth: number,
  gap: number,
  height: number,
): RectSpec[] {
  assertPositive(width, merlonWidth, height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(gap) || gap < 0) {
    throw new Error("Dimensões inválidas");
  }
  const rects: RectSpec[] = [];
  for (let index = 0; x + index * (merlonWidth + gap) + merlonWidth <= x + width + 1e-9; index += 1) {
    rects.push({
      x: round(x + index * (merlonWidth + gap)),
      y: round(y - height),
      width: round(merlonWidth),
      height: round(height),
    });
  }
  return rects;
}

// Linha de ondas: segmentos quadráticos alternados acima e abaixo de baseY.
export function wavePath(width: number, baseY: number, amplitude: number, wavelength: number): string {
  assertPositive(width, wavelength);
  if (!Number.isFinite(baseY) || !Number.isFinite(amplitude)) {
    throw new Error("Dimensões inválidas");
  }
  const half = wavelength / 2;
  const segments = Math.ceil(width / half);
  let path = `M0 ${round(baseY)}`;
  for (let index = 0; index < segments; index += 1) {
    const startX = index * half;
    const controlY = baseY + (index % 2 === 0 ? -amplitude : amplitude);
    path += ` Q${round(startX + half / 2)} ${round(controlY)} ${round(startX + half)} ${round(baseY)}`;
  }
  return path;
}

// Colina ou ilha: arco fechado cuja altura máxima é `height` acima de baseY.
export function hillPath(cx: number, baseY: number, width: number, height: number): string {
  assertPositive(width, height);
  if (!Number.isFinite(cx) || !Number.isFinite(baseY)) {
    throw new Error("Dimensões inválidas");
  }
  return `M${round(cx - width / 2)} ${round(baseY)} Q${round(cx)} ${round(baseY - 2 * height)} ${round(cx + width / 2)} ${round(baseY)} Z`;
}

// Raízes aéreas de mangal: partem do tronco e abrem-se até ao chão.
export function mangroveRoots(
  cx: number,
  baseY: number,
  count: number,
  spread: number,
  height: number,
): Segment[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Número de raízes inválido");
  }
  assertPositive(spread, height);
  if (!Number.isFinite(cx) || !Number.isFinite(baseY)) {
    throw new Error("Dimensões inválidas");
  }
  const roots: Segment[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = (count === 1 ? 0.5 : index / (count - 1)) - 0.5;
    roots.push({
      x1: round(cx + offset * spread * 0.2),
      y1: round(baseY - height),
      x2: round(cx + offset * spread),
      y2: round(baseY),
    });
  }
  return roots;
}
