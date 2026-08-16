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
  readonly accentColor?: string;
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
          const sec = secondsAt(grabX.current);
          setScrubbing(true);
          setScrubSec(sec);
          onScrub?.(sec);
        },
        onPanResponderMove: (_event, gesture) => {
          const sec = secondsAt(grabX.current + gesture.dx);
          setScrubSec(sec);
          onScrub?.(sec);
        },
        onPanResponderRelease: (_event, gesture) => {
          const sec = secondsAt(grabX.current + gesture.dx);
          setScrubbing(false);
          onScrub?.(null);
          onSeek(sec);
        },
        onPanResponderTerminate: () => {
          setScrubbing(false);
          onScrub?.(null);
        },
      }),
    [onScrub, onSeek, secondsAt],
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
