/**
 * Иконки одним компонентом.
 *
 * Векторные пути вместо юникодных глифов (▶ ⌕ ⚙): глифы рисуются системным
 * шрифтом, поэтому их вид, вес и вертикальное выравнивание отличаются на
 * каждой прошивке. Пути выглядят одинаково везде и красятся `currentColor`.
 *
 * Все контуры нарисованы в сетке 24×24 с толщиной штриха 1.8 —
 * добавляя иконку, придерживайтесь тех же параметров. Исключение — залитые
 * элементы управления плеером (`playFilled`, `pause`): у них штриха нет,
 * потому что на кадре видео заливка читается лучше контура.
 */

import React from 'react';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

export type IconName =
  | 'play'
  | 'playFilled'
  | 'pause'
  | 'search'
  | 'library'
  | 'settings'
  | 'star'
  | 'starFilled'
  | 'external'
  | 'close'
  | 'refresh'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronUp'
  | 'lock'
  | 'check'
  | 'alert'
  | 'trash'
  | 'arrowLeft'
  | 'rewind'
  | 'forward'
  | 'skipNext'
  | 'skipPrevious'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'more'
  | 'share'
  | 'pip'
  | 'speed'
  | 'quality'
  | 'subtitles'
  | 'volume'
  | 'volumeOff'
  | 'brightness'
  | 'timer'
  | 'queue'
  | 'repeat'
  | 'fit'
  | 'clock';

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
    case 'pause':
      return (
        <>
          <Path d="M8 4.5h2.8v15H8z" fill={color} />
          <Path d="M13.2 4.5H16v15h-2.8z" fill={color} />
        </>
      );
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
    case 'chevronDown':
      return <Path d="M5.5 9L12 15.5L18.5 9" {...stroke} />;
    case 'chevronUp':
      return <Path d="M5.5 15L12 8.5L18.5 15" {...stroke} />;
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
    case 'arrowLeft':
      return (
        <>
          <Path d="M20 12H4.5" {...stroke} />
          <Path d="M10.5 5.5L4 12l6.5 6.5" {...stroke} />
        </>
      );
    // Перемотка: двойной треугольник читается быстрее круговой стрелки,
    // а число секунд подписывается рядом самим элементом управления.
    case 'rewind':
      return (
        <>
          <Polygon points="11.5,6 11.5,18 3.5,12" fill={color} />
          <Polygon points="20.5,6 20.5,18 12.5,12" fill={color} />
        </>
      );
    case 'forward':
      return (
        <>
          <Polygon points="12.5,6 12.5,18 20.5,12" fill={color} />
          <Polygon points="3.5,6 3.5,18 11.5,12" fill={color} />
        </>
      );
    case 'skipNext':
      return (
        <>
          <Polygon points="5,5.5 5,18.5 15,12" fill={color} />
          <Path d="M18.5 5.5v13" strokeWidth={2.4} stroke={color} strokeLinecap="round" />
        </>
      );
    case 'skipPrevious':
      return (
        <>
          <Polygon points="19,5.5 19,18.5 9,12" fill={color} />
          <Path d="M5.5 5.5v13" strokeWidth={2.4} stroke={color} strokeLinecap="round" />
        </>
      );
    case 'fullscreen':
      return (
        <>
          <Path d="M9.5 4H4v5.5" {...stroke} />
          <Path d="M14.5 4H20v5.5" {...stroke} />
          <Path d="M9.5 20H4v-5.5" {...stroke} />
          <Path d="M14.5 20H20v-5.5" {...stroke} />
        </>
      );
    case 'fullscreenExit':
      return (
        <>
          <Path d="M4 9.5h5.5V4" {...stroke} />
          <Path d="M20 9.5h-5.5V4" {...stroke} />
          <Path d="M4 14.5h5.5V20" {...stroke} />
          <Path d="M20 14.5h-5.5V20" {...stroke} />
        </>
      );
    case 'more':
      return (
        <>
          <Circle cx={12} cy={5.2} r={1.7} fill={color} />
          <Circle cx={12} cy={12} r={1.7} fill={color} />
          <Circle cx={12} cy={18.8} r={1.7} fill={color} />
        </>
      );
    case 'share':
      return (
        <>
          <Circle cx={17.5} cy={6} r={2.6} {...stroke} />
          <Circle cx={6.5} cy={12} r={2.6} {...stroke} />
          <Circle cx={17.5} cy={18} r={2.6} {...stroke} />
          <Path d="M8.9 10.8L15.2 7.3" {...stroke} />
          <Path d="M8.9 13.2l6.3 3.5" {...stroke} />
        </>
      );
    case 'pip':
      return (
        <>
          <Path d="M3.5 5.5h17v13h-17z" {...stroke} />
          <Path d="M12 12h6.5v5H12z" fill={color} />
        </>
      );
    case 'speed':
      return (
        <>
          <Path d="M4 17a8.5 8.5 0 1 1 16 0" {...stroke} />
          <Path d="M12 17l4.2-5.4" {...stroke} />
          <Circle cx={12} cy={17} r={1.3} fill={color} />
        </>
      );
    case 'quality':
      return (
        <>
          <Path d="M4 8h9M17 8h3" {...stroke} />
          <Path d="M4 16h3M11 16h9" {...stroke} />
          <Circle cx={15} cy={8} r={2.2} {...stroke} />
          <Circle cx={9} cy={16} r={2.2} {...stroke} />
        </>
      );
    case 'subtitles':
      return (
        <>
          <Path d="M3.5 5.5h17v13h-17z" {...stroke} />
          <Path d="M7 14.2h4" {...stroke} />
          <Path d="M13 14.2h4" {...stroke} />
          <Path d="M7 10.4h10" {...stroke} />
        </>
      );
    case 'volume':
      return (
        <>
          <Polygon points="4,9.5 8,9.5 12.5,5.5 12.5,18.5 8,14.5 4,14.5" {...stroke} />
          <Path d="M16 9.4a3.6 3.6 0 0 1 0 5.2" {...stroke} />
          <Path d="M18.6 6.8a7.2 7.2 0 0 1 0 10.4" {...stroke} />
        </>
      );
    case 'volumeOff':
      return (
        <>
          <Polygon points="4,9.5 8,9.5 12.5,5.5 12.5,18.5 8,14.5 4,14.5" {...stroke} />
          <Path d="M16 9.5l5 5" {...stroke} />
          <Path d="M21 9.5l-5 5" {...stroke} />
        </>
      );
    case 'brightness':
      return (
        <>
          <Circle cx={12} cy={12} r={4} {...stroke} />
          <Path
            d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3"
            {...stroke}
          />
        </>
      );
    case 'timer':
      return (
        <>
          <Circle cx={12} cy={13.5} r={7.5} {...stroke} />
          <Path d="M12 9.5v4h3" {...stroke} />
          <Path d="M9.5 2.5h5" {...stroke} />
        </>
      );
    case 'queue':
      return (
        <>
          <Path d="M4 6.5h16" {...stroke} />
          <Path d="M4 12h11" {...stroke} />
          <Path d="M4 17.5h11" {...stroke} />
          <Polygon points="18,12 22,14.8 18,17.6" fill={color} />
        </>
      );
    case 'repeat':
      return (
        <>
          <Path d="M6.5 7.5h11a3 3 0 0 1 3 3v1.5" {...stroke} />
          <Path d="M9 5l-2.5 2.5L9 10" {...stroke} />
          <Path d="M17.5 16.5h-11a3 3 0 0 1-3-3V12" {...stroke} />
          <Path d="M15 19l2.5-2.5L15 14" {...stroke} />
        </>
      );
    case 'fit':
      return (
        <>
          <Path d="M3.5 6.5h17v11h-17z" {...stroke} />
          <Path d="M8.5 9.5h7v5h-7z" {...stroke} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="M12 7v5.4l3.4 2" {...stroke} />
        </>
      );
    default:
      return null;
  }
}
