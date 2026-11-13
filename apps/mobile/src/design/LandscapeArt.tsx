import Svg, { Circle, Line, Path, Polygon, Rect } from "react-native-svg";
import { pointsToString, starPoints } from "./patterns";
import { artAccessibility, sceneColors, type SceneVariant } from "./scene-colors";
import { hillPath, mangroveRoots, wavePath } from "./scenes";
import { palette } from "./tokens";

interface Props {
  width: number;
  variant?: SceneVariant;
  label?: string;
}

const VIEW_W = 320;
const VIEW_H = 160;

function heightFor(width: number): number {
  return (width * VIEW_H) / VIEW_W;
}

export function MangroveScene({ width, variant = "dark", label }: Props) {
  const colors = sceneColors(variant);
  const trees = [70, 160, 250];

  return (
    <Svg
      width={width}
      height={heightFor(width)}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      {...artAccessibility(label)}
    >
      <Rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={colors.sky} />
      <Polygon points={pointsToString(starPoints(262, 34, 13, 5.2))} fill={colors.star} />
      <Path d={`${wavePath(VIEW_W, 112, 5, 40)} V${VIEW_H} H0 Z`} fill={colors.water} />

      {trees.map((cx) => (
        <Line key={`trunk-${cx}`} x1={cx} y1={70} x2={cx} y2={90} stroke={colors.trunk} strokeWidth={4} strokeLinecap="round" />
      ))}
      {trees.flatMap((cx) =>
        mangroveRoots(cx, 120, 5, 46, 30).map((root, index) => (
          <Line
            key={`root-${cx}-${index}`}
            x1={root.x1}
            y1={root.y1}
            x2={root.x2}
            y2={root.y2}
            stroke={colors.trunk}
            strokeWidth={3}
            strokeLinecap="round"
          />
        )),
      )}
      {trees.map((cx) => (
        <Circle key={`canopy-a-${cx}`} cx={cx} cy={64} r={24} fill={colors.canopy} />
      ))}
      {trees.map((cx) => (
        <Circle key={`canopy-b-${cx}`} cx={cx - 17} cy={76} r={16} fill={colors.canopy} />
      ))}
      {trees.map((cx) => (
        <Circle key={`canopy-c-${cx}`} cx={cx + 17} cy={76} r={16} fill={colors.canopy} />
      ))}

      <Path d={`${wavePath(VIEW_W, 128, 4, 32)} V${VIEW_H} H0 Z`} fill={colors.water} />
      <Path d={`${wavePath(VIEW_W, 128, 4, 32)} V${VIEW_H} H0 Z`} fill={palette.ink} fillOpacity={0.25} />
    </Svg>
  );
}

export function BijagosScene({ width, variant = "dark", label }: Props) {
  const colors = sceneColors(variant);

  return (
    <Svg
      width={width}
      height={heightFor(width)}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      {...artAccessibility(label)}
    >
      <Rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={colors.sky} />
      <Polygon points={pointsToString(starPoints(250, 36, 14, 5.6))} fill={colors.star} />
      <Path d={hillPath(230, 118, 170, 34)} fill={colors.hillFar} />
      <Path d={hillPath(90, 118, 150, 46)} fill={colors.hillNear} />
      <Path d={`${wavePath(VIEW_W, 118, 5, 36)} V${VIEW_H} H0 Z`} fill={colors.water} />

      <Polygon points="170,98 170,124 190,124" fill={colors.boatSail} />
      <Path d="M150 126 H194 L187 135 H157 Z" fill={colors.boatHull} />

      <Path d={`${wavePath(VIEW_W, 138, 4, 30)} V${VIEW_H} H0 Z`} fill={colors.water} />
      <Path d={`${wavePath(VIEW_W, 138, 4, 30)} V${VIEW_H} H0 Z`} fill={palette.ink} fillOpacity={0.25} />
    </Svg>
  );
}
