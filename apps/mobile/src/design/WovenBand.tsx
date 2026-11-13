import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Polygon, Rect } from "react-native-svg";
import { buildBand } from "./patterns";
import { palette } from "./tokens";

interface Props {
  width: number;
  cell?: number;
}

// Decorativa: escondida dos leitores de ecrã.
export function WovenBand({ width, cell = 14 }: Props) {
  const band = useMemo(() => buildBand(width, cell), [width, cell]);

  return (
    <View
      style={{ width, height: band.height, overflow: "hidden" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={band.height} viewBox={`0 0 ${width} ${band.height}`}>
        {band.shapes.map((shape, index) =>
          shape.kind === "rect" ? (
            <Rect
              key={index}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              fill={palette[shape.color]}
            />
          ) : (
            <Polygon key={index} points={shape.points} fill={palette[shape.color]} />
          ),
        )}
      </Svg>
    </View>
  );
}
