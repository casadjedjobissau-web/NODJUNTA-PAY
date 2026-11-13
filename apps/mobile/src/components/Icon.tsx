import Svg, { Path } from "react-native-svg";
import { FILLED_ICONS, ICONS, ICON_GRID, type IconName } from "../design/icons";
import { artAccessibility } from "../design/scene-colors";
import { colors } from "../design/tokens";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  label?: string;
}

export function Icon({ name, size = 24, color = colors.textPrimary, strokeWidth = 2, label }: Props) {
  const filled = FILLED_ICONS.has(name);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ICON_GRID} ${ICON_GRID}`} {...artAccessibility(label)}>
      <Path
        d={ICONS[name]}
        fill={filled ? color : "none"}
        stroke={filled ? "none" : color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
