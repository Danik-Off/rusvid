/**
 * Иконки одним компонентом.
 *
 * Векторные пути вместо юникодных глифов (▶ ⌕ ⚙): глифы рисуются системным
 * шрифтом, поэтому их вид, вес и вертикальное выравнивание отличаются на
 * каждой прошивке. Пути выглядят одинаково везде и красятся `currentColor`.
 *
 * Все контуры нарисованы в сетке 24×24 с толщиной штриха 1.8 —
 * добавляя иконку, придерживайтесь тех же параметров.
 */

import React from 'react';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

export type IconName =
  | 'play'
  | 'playFilled'
  | 'search'
  | 'library'
  | 'settings'
  | 'star'
  | 'starFilled'
  | 'external'
  | 'close'
  | 'refresh'
  | 'chevronRight'
  | 'lock'
  | 'check'
  | 'alert'
  | 'trash';

interface Props {
  readonly name: IconName;
  readonly size?: number;
  readonly color: string;
}

const STROKE_WIDTH = 1.8;

export const Icon: React.FC<Props> = ({ name, size = 22, color }) => {
  const stroke = {
    stroke: color,
    strokeWidth: STROKE_WIDTH,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths(name, color, stroke)}
    </Svg>
  );
};

function renderPaths(
  name: IconName,
  color: string,
  stroke: Record<string, unknown>,
): React.ReactNode {
  switch (name) {
    case 'play':
      return (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Polygon points="10,8.5 16,12 10,15.5" fill={color} />
        </>
      );
    case 'playFilled':
      return <Polygon points="7,4.5 19,12 7,19.5" fill={color} />;
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={6.5} {...stroke} />
          <Path d="M15.8 15.8 L20.5 20.5" {...stroke} />
        </>
      );
    case 'library':
      return (
        <>
          <Path d="M4 6h10" {...stroke} />
          <Path d="M4 12h10" {...stroke} />
          <Path d="M4 18h7" {...stroke} />
          <Polygon points="16.5,11 21.5,14 16.5,17" fill={color} />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx={12} cy={12} r={3} {...stroke} />
          <Path
            d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6"
            {...stroke}
          />
        </>
      );
    case 'star':
      return (
        <Path
          d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8z"
          {...stroke}
        />
      );
    case 'starFilled':
      return (
        <Path
          d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8z"
          fill={color}
        />
      );
    case 'external':
      return (
        <>
          <Path d="M14 5h5v5" {...stroke} />
          <Path d="M19 5l-7.5 7.5" {...stroke} />
          <Path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" {...stroke} />
        </>
      );
    case 'close':
      return (
        <>
          <Path d="M6 6l12 12" {...stroke} />
          <Path d="M18 6L6 18" {...stroke} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M20 12a8 8 0 1 1-2.5-5.8" {...stroke} />
          <Path d="M20 4v4h-4" {...stroke} />
        </>
      );
    case 'chevronRight':
      return <Path d="M9.5 5.5L16 12l-6.5 6.5" {...stroke} />;
    case 'lock':
      return (
        <>
          <Path d="M6.5 10.5h11v9h-11z" {...stroke} />
          <Path d="M9 10.5V8a3 3 0 0 1 6 0v2.5" {...stroke} />
        </>
      );
    case 'check':
      return <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} />;
    case 'alert':
      return (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 7.5v5.5" {...stroke} />
          <Circle cx={12} cy={16.4} r={0.9} fill={color} />
        </>
      );
    case 'trash':
      return (
        <>
          <Path d="M4.5 7h15" {...stroke} />
          <Path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" {...stroke} />
          <Path d="M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" {...stroke} />
        </>
      );
    default:
      return null;
  }
}
