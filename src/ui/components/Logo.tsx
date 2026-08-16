/**
 * Логотип приложения.
 *
 * Знак — треугольник «play», разрезанный на три дольки: три платформы,
 * один плеер. Та же геометрия стоит на иконке запуска и на сплэше, поэтому
 * пути ниже нельзя править вручную — они порождаются `tools/gen-icons.mjs`
 * (`npm run icons` перерисует и SVG в assets/, и ресурсы Android).
 *
 * `tile` повторяет иконку запуска целиком, `mark` — только знак, который
 * при заданном `color` красится плоско и годится для одноцветных мест.
 */

import React from 'react';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Пути знака в сетке 96×96 (см. MARK_PATHS в генераторе). */
const MARK_PATHS = [
  'M28.97 20.75L38.97 26.29A2 2 0 0 1 40 28.04L40 67.96A2 2 0 0 1 38.97 69.71L28.97 75.25A2 2 0 0 1 26 73.5L26 22.5A2 2 0 0 1 28.97 20.75Z',
  'M46.97 30.73L54.97 35.16A2 2 0 0 1 56 36.91L56 59.09A2 2 0 0 1 54.97 60.84L46.97 65.27A2 2 0 0 1 44 63.52L44 32.48A2 2 0 0 1 46.97 30.73Z',
  'M62.97 39.6L74.97 46.25A2 2 0 0 1 74.97 49.75L62.97 56.4A2 2 0 0 1 60 54.65L60 41.35A2 2 0 0 1 62.97 39.6Z',
];

/** Плитка: сторона, отступ, скругление и место знака внутри неё. */
const TILE = 256;
const TILE_INSET = 10;
const TILE_RADIUS = 58;
const MARK_SCALE = 2.08;
const MARK_OFFSET = 28.16;

const TILE_FROM = '#1B2233';
const TILE_TO = '#0A0D14';
const MARK_FROM = '#8FB2FF';
const MARK_TO = '#4A74FF';

interface Props {
  readonly size?: number;
  readonly variant?: 'tile' | 'mark';
  /** Плоский цвет знака вместо фирменного градиента; на `tile` не влияет. */
  readonly color?: string;
}

export const Logo: React.FC<Props> = ({ size = 48, variant = 'tile', color }) => {
  // Идентификаторы градиентов должны быть уникальны на всё дерево: два
  // логотипа на экране с одинаковыми id перекрасили бы друг друга.
  const uid = React.useId().replace(/:/g, '');
  const tileGradient = `logo-tile-${uid}`;
  const markGradient = `logo-mark-${uid}`;
  const markFill = color ?? `url(#${markGradient})`;

  const mark = MARK_PATHS.map((d) => <Path key={d} d={d} fill={markFill} />);

  const gradients = (
    <Defs>
      <LinearGradient id={tileGradient} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={TILE_FROM} />
        <Stop offset="1" stopColor={TILE_TO} />
      </LinearGradient>
      <LinearGradient id={markGradient} x1="0.15" y1="0" x2="0.9" y2="1">
        <Stop offset="0" stopColor={MARK_FROM} />
        <Stop offset="1" stopColor={MARK_TO} />
      </LinearGradient>
    </Defs>
  );

  if (variant === 'mark') {
    return (
      <Svg width={size} height={size} viewBox="0 0 96 96">
        {gradients}
        {mark}
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${TILE} ${TILE}`}>
      {gradients}
      <Rect
        x={TILE_INSET}
        y={TILE_INSET}
        width={TILE - TILE_INSET * 2}
        height={TILE - TILE_INSET * 2}
        rx={TILE_RADIUS}
        fill={`url(#${tileGradient})`}
      />
      <G transform={`translate(${MARK_OFFSET}, ${MARK_OFFSET}) scale(${MARK_SCALE})`}>{mark}</G>
    </Svg>
  );
};
