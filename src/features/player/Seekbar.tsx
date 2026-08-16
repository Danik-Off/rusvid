import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors, radius } from '../../ui/theme';
import { clamp } from './playerStore';

interface Props {
  readonly positionSec: number;
  readonly durationSec: number;
  readonly bufferedSec: number;
  /** Отпустили палец — перемотать сюда. */
  readonly onSeek: (sec: number) => void;
  /** Ведём палец: `null` — перетаскивание закончилось. */
  readonly onScrub?: (sec: number | null) => void;
  /** Текущая точность перемотки — плеер показывает её подсказкой. */
  readonly onPrecisionChange?: (precision: number | null) => void;
  readonly accentColor?: string;
}

/**
 * Точная перемотка: чем дальше палец от полосы по вертикали, тем медленнее
 * едет позиция.
 *
 * На двухчасовом видео вся полоса — это примерно 20 секунд на пиксель, и
 * попасть в нужный момент пальцем физически невозможно. Отводя палец вниз или
 * вверх, пользователь получает 1/2, 1/5 и 1/10 скорости, то есть точность до
 * секунды, — приём знаком по десктопным видеоредакторам, но в мобильных
 * плеерах почти не встречается.
 */
const PRECISION_STEPS: readonly { readonly distance: number; readonly factor: number }[] = [
  { distance: 0, factor: 1 },
  { distance: 60, factor: 0.5 },
  { distance: 130, factor: 0.2 },
  { distance: 220, factor: 0.1 },
];

export function precisionAt(verticalDistance: number): number {
  const distance = Math.abs(verticalDistance);
  let factor = 1;
  for (const step of PRECISION_STEPS) {
    if (distance >= step.distance) {
      factor = step.factor;
    }
  }
  return factor;
}

/** Вертикальный запас под палец: сама полоска тонкая, попасть в неё сложно. */
const TOUCH_PADDING = 14;

const TRACK_HEIGHT = 3;
const TRACK_HEIGHT_ACTIVE = 5;
const THUMB_SIZE = 14;

/**
 * Полоса перемотки.
 *
 * Своя, а не системный слайдер: нужен третий слой (буфер), увеличение
 * полосы под пальцем и превью времени, которое рисует уже сам плеер.
 */
export const Seekbar: React.FC<Props> = ({
  positionSec,
  durationSec,
  bufferedSec,
  onSeek,
  onScrub,
  onPrecisionChange,
  accentColor = colors.accent,
}) => {
  const [width, setWidth] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubSec, setScrubSec] = useState(0);

  // PanResponder создаётся один раз, поэтому свежие ширина и длительность
  // читаются из ref: иначе внутри замыкания навсегда останутся нули.
  const geometry = useRef({ width: 0, durationSec: 0 });
  geometry.current = { width, durationSec };

  /** Точка касания в момент нажатия: движение считаем от неё, а не от `locationX`. */
  const grabX = useRef(0);
  /** Накопленное смещение с учётом текущей точности. */
  const offsetX = useRef(0);
  const lastDx = useRef(0);
  const precision = useRef(1);

  const secondsAt = useCallback((x: number) => {
    const { width: trackWidth, durationSec: total } = geometry.current;
    if (trackWidth <= 0 || total <= 0) {
      return 0;
    }
    return clamp(x / trackWidth, 0, 1) * total;
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Забираем жест у родителя: иначе горизонтальное ведение по полосе
        // перехватил бы свайп сворачивания плеера.
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          grabX.current = event.nativeEvent.locationX;
          offsetX.current = 0;
          lastDx.current = 0;
          precision.current = 1;
          const sec = secondsAt(grabX.current);
          setScrubbing(true);
          setScrubSec(sec);
          onScrub?.(sec);
        },
        // Позиция считается по накопленному смещению, а не по абсолютной
        // координате: точность меняется прямо во время жеста, и «пересчитать
        // от начала» дало бы скачок при каждом переходе между ступенями.
        onPanResponderMove: (_event, gesture) => {
          const factor = precisionAt(gesture.dy);
          if (factor !== precision.current) {
            // Смена ступени: фиксируем текущую точку как новую опорную,
            // иначе палец «перепрыгнул» бы вперёд или назад.
            offsetX.current += (gesture.dx - lastDx.current) * precision.current;
            lastDx.current = gesture.dx;
            precision.current = factor;
            onPrecisionChange?.(factor);
          }
          offsetX.current += (gesture.dx - lastDx.current) * factor;
          lastDx.current = gesture.dx;

          const sec = secondsAt(grabX.current + offsetX.current);
          setScrubSec(sec);
          onScrub?.(sec);
        },
        onPanResponderRelease: () => {
          const sec = secondsAt(grabX.current + offsetX.current);
          setScrubbing(false);
          onScrub?.(null);
          onPrecisionChange?.(null);
          onSeek(sec);
        },
        onPanResponderTerminate: () => {
          setScrubbing(false);
          onScrub?.(null);
          onPrecisionChange?.(null);
        },
      }),
    [onScrub, onPrecisionChange, onSeek, secondsAt],
  );

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const shown = scrubbing ? scrubSec : positionSec;
  const ratio = durationSec > 0 ? clamp(shown / durationSec, 0, 1) : 0;
  const bufferedRatio = durationSec > 0 ? clamp(bufferedSec / durationSec, 0, 1) : 0;
  const height = scrubbing ? TRACK_HEIGHT_ACTIVE : TRACK_HEIGHT;

  return (
    <View style={styles.touchArea} {...responder.panHandlers} onLayout={onLayout}>
      <View style={[styles.track, { height }]}>
        <View style={[styles.buffered, { width: `${bufferedRatio * 100}%`, height }]} />
        <View style={[styles.played, { width: `${ratio * 100}%`, height, backgroundColor: accentColor }]} />
      </View>
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: accentColor,
            left: ratio * width - THUMB_SIZE / 2,
            transform: [{ scale: scrubbing ? 1.35 : 1 }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  touchArea: {
    paddingVertical: TOUCH_PADDING,
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  buffered: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  played: {
    position: 'absolute',
    left: 0,
  },
  thumb: {
    position: 'absolute',
    top: TOUCH_PADDING + (TRACK_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});
