import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { getProviderMeta } from '../../app/container/providerMeta';
import type { VideoSummary } from '../../core/model/media';
import { formatDuration, formatPublishedAt, formatViews } from '../../core/utils/format';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';
import { ProviderBadge } from './ProviderBadge';

interface Props {
  readonly video: VideoSummary;
  readonly onPress: (video: VideoSummary) => void;
  readonly onLongPress?: (video: VideoSummary) => void;
  /** Прогресс просмотра 0..1 — полоска под превью. */
  readonly progress?: number;
  readonly isFavorite?: boolean;
}

const VideoCardComponent: React.FC<Props> = ({
  video,
  onPress,
  onLongPress,
  progress,
  isFavorite,
}) => {
  const provider = getProviderMeta(video.providerId);
  const duration = formatDuration(video.durationSec);
  const views = formatViews(video.viewCount);
  const published = formatPublishedAt(video.publishedAt);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(video)}
      onLongPress={onLongPress ? () => onLongPress(video) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${video.title}. Платформа ${provider.title}${
        duration ? `, длительность ${duration}` : ''
      }`}>
      <View style={styles.thumbnailWrapper}>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailFallback]}>
            <Icon name="playFilled" size={28} color={colors.textMuted} />
          </View>
        )}

        {/* Затемнение снизу: белый текст плашек читается на любом превью. */}
        <View style={styles.scrim} />

        <View style={styles.topRow}>
          <ProviderBadge label={provider.badge} color={provider.accentColor} />
          {video.access !== 'free' ? (
            <View style={styles.accessPill}>
              <Icon name="lock" size={11} color={colors.textInverse} />
              <Text style={styles.accessText}>
                {video.access === 'paid' ? 'ПОДПИСКА' : '18+'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottomRow}>
          {isFavorite ? (
            <View style={styles.favoritePill}>
              <Icon name="starFilled" size={12} color={colors.warning} />
            </View>
          ) : (
            <View />
          )}
          {video.isLive ? (
            <View style={[styles.pill, styles.livePill]}>
              <View style={styles.liveDot} />
              <Text style={styles.pillText}>В ЭФИРЕ</Text>
            </View>
          ) : duration ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{duration}</Text>
            </View>
          ) : null}
        </View>

        {progress !== undefined && progress > 0.01 ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${Math.min(100, progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {video.title}
        </Text>
        <View style={styles.metaRow}>
          {video.author?.name ? (
            <Text style={styles.author} numberOfLines={1}>
              {video.author.name}
            </Text>
          ) : null}
          {views || published ? (
            <Text style={styles.meta} numberOfLines={1}>
              {[views && `${views} просм.`, published].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

/**
 * Карточки перерисовываются пачками при подгрузке страниц, поэтому memo
 * по uid, прогрессу и избранному заметно снижает нагрузку на длинных списках.
 */
export const VideoCard = memo(
  VideoCardComponent,
  (prev, next) =>
    prev.video.uid === next.video.uid &&
    prev.progress === next.progress &&
    prev.isFavorite === next.isFavorite,
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...elevation.card,
  },
  cardPressed: {
    opacity: 0.72,
  },
  thumbnailWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceElevated,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Затемняем только нижнюю часть — там плашки длительности и избранного.
    top: '55%',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bottomRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.scrim,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  livePill: {
    backgroundColor: colors.danger,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  pillText: {
    ...typography.badge,
    color: colors.white,
    letterSpacing: 0.4,
  },
  accessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  accessText: {
    ...typography.badge,
    color: colors.textInverse,
    letterSpacing: 0.4,
  },
  favoritePill: {
    backgroundColor: colors.scrim,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.borderStrong,
  },
  progressBar: {
    height: 3,
    backgroundColor: colors.accent,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  metaRow: {
    gap: spacing.xxs,
  },
  author: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
