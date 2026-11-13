import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";
import { pointsToString, starPoints } from "./patterns";
import { artAccessibility, sceneColors, type SceneVariant } from "./scene-colors";
import { crenellations } from "./scenes";

interface Props {
  width: number;
  variant?: SceneVariant;
  label?: string;
}

const VIEW_W = 320;
const VIEW_H = 160;

export function FortressScene({ width, variant = "dark", label }: Props) {
  const colors = sceneColors(variant);
  const wallTop = crenellations(60, 84, 200, 12, 8, 8);
  const leftTower = crenellations(50, 66, 36, 8, 4, 7);
  const rightTower = crenellations(234, 66, 36, 8, 4, 7);

  return (
    <Svg
      width={width}
      height={(width * VIEW_H) / VIEW_W}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      {...artAccessibility(label)}
    >
      <Rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={colors.sky} />
      <Polygon points={pointsToString(starPoints(160, 30, 13, 5.2))} fill={colors.star} />

      <Rect x={0} y={120} width={VIEW_W} height={40} fill={colors.hillFar} />

      <Rect x={60} y={84} width={200} height={36} fill={colors.stone} />
      {wallTop.map((rect, index) => (
        <Rect key={`wall-${index}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={colors.stone} />
      ))}

      <Rect x={50} y={66} width={36} height={54} fill={colors.stone} />
      {leftTower.map((rect, index) => (
        <Rect key={`left-${index}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={colors.stone} />
      ))}
      <Rect x={234} y={66} width={36} height={54} fill={colors.stone} />
      {rightTower.map((rect, index) => (
        <Rect key={`right-${index}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={colors.stone} />
      ))}

      <Path d="M148 120 V104 Q160 90 172 104 V120 Z" fill={colors.opening} />
      <Rect x={64} y={96} width={8} height={12} rx={4} fill={colors.opening} />
      <Rect x={248} y={96} width={8} height={12} rx={4} fill={colors.opening} />
      <Rect x={62} y={82} width={14} height={0} fill={colors.opening} />
    </Svg>
  );
}

// Silhueta genérica de um monumento: figura em pedestal, sem traços individuais.
// Para a apresentação institucional com a estátua de Amílcar Cabral, substituir por
// uma imagem de referência fornecida ou licenciada.
export function MonumentScene({ width, variant = "dark", label }: Props) {
  const colors = sceneColors(variant);

  return (
    <Svg width={width} height={width} viewBox="0 0 200 200" {...artAccessibility(label)}>
      <Rect x={0} y={0} width={200} height={200} fill={colors.sky} />
      <Polygon points={pointsToString(starPoints(100, 34, 14, 5.6))} fill={colors.star} />
      <Rect x={0} y={184} width={200} height={16} fill={colors.hillFar} />

      <Circle cx={100} cy={72} r={11} fill={colors.stone} />
      <Path d="M82 150 L86 92 Q100 84 114 92 L118 150 Z" fill={colors.stone} />
      <Rect x={70} y={150} width={60} height={22} fill={colors.stone} />
      <Rect x={58} y={172} width={84} height={12} fill={colors.stone} />
    </Svg>
  );
}
