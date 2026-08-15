/**
 * Скелетоны списка.
 *
 * Пульсирующие плейсхолдеры вместо спиннера: у карточек известна геометрия,
 * поэтому при появлении данных ничего не «прыгает», и ожидание читается как
 * прогресс, а не как зависание.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';

interface BlockProps {
  readonly width?: ViewStyle['width'];
  readonly height: number;
  readonly style?: ViewStyle;
}

/** Один пульсирующий прямоугольник. */
export const SkeletonBlock: React.FC<BlockProps> = ({ width = '100%', height, style }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return <Animated.View style={[styles.block, { width, height, opacity }, style]} />;
};

/** Заглушка одной карточки видео — повторяет её раскладку. */
export const VideoCardSkeleton: React.FC = () => (
  <View style={styles.card}>
    <SkeletonBlock height={0} style={styles.thumbnail} />
    <View style={styles.body}>
      <SkeletonBlock height={14} width="88%" />
      <SkeletonBlock height={14} width="55%" />
      <SkeletonBlock height={10} width="40%" style={styles.metaLine} />
    </View>
  </View>
);

/** Экран ожидания списка: несколько карточек-заглушек. */
export const VideoListSkeleton: React.FC<{ readonly count?: number }> = ({ count = 4 }) => (
  <View>
    {Array.from({ length: count }, (_, index) => (
      <VideoCardSkeleton key={index} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 0,
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  metaLine: {
    marginTop: spacing.xxs,
  },
});
