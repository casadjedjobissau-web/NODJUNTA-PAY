import { pointsToString, starPoints } from "./patterns";
import { palette } from "./tokens";

const STAR = pointsToString(starPoints(50, 46, 28, 11.2));
const DIAMONDS = [36, 50, 64].map((cx) =>
  pointsToString([
    { x: cx, y: 80 },
    { x: cx + 4.5, y: 84.5 },
    { x: cx, y: 89 },
    { x: cx - 4.5, y: 84.5 },
  ]),
);

function marks(): string {
  return [
    `<polygon points="${STAR}" fill="${palette.ink}"/>`,
    ...DIAMONDS.map((points) => `<polygon points="${points}" fill="${palette.white}"/>`),
  ].join("");
}

function wrap(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">${content}</svg>`;
}

// Ícone da loja: quadrado verde de lado a lado (as lojas arredondam os cantos), sem transparência.
export function iconSvg(): string {
  return wrap(`<rect x="0" y="0" width="100" height="100" fill="${palette.green}"/>${marks()}`);
}

// Primeiro plano do ícone adaptável do Android: fundo transparente e conteúdo na zona segura.
export function adaptiveForegroundSvg(): string {
  return wrap(`<g transform="translate(50 50) scale(0.6) translate(-50 -53.5)">${marks()}</g>`);
}

// Ecrã de arranque: marca com cantos arredondados sobre fundo transparente (a cor vem da configuração).
export function splashSvg(): string {
  return wrap(`<rect x="0" y="0" width="100" height="100" rx="24" fill="${palette.green}"/>${marks()}`);
}

export function faviconSvg(): string {
  return iconSvg();
}
