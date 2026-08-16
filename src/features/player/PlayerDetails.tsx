import React, { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { getProviderMeta } from '../../app/container/providerMeta';
import type { VideoSummary } from '../../core/model/media';
import { formatClock, formatDuration, formatPublishedAt, formatViews } from '../../core/utils/format';
import { Icon, type IconName } from '../../ui/components/Icon';
import { ProviderBadge } from '../../ui/components/ProviderBadge';
import { colors, radius, spacing, typography } from '../../ui/theme';
import { useLibraryStore } from '../library/libraryStore';
import { usePlayerStore } from './playerStore';

interface Props {
  readonly video: VideoSummary;
  readonly bottomSpace: number;
  readonly onOpenSettings: () => void;
}

/**
 * Всё, что под кадром: описание, действия и очередь.
 *
 * Живёт в том же оверлее, что и плеер, а не на отдельном экране: сворачивание
 * в мини-плеер должно убирать описание вместе с кадром одним движением.
 */
export const PlayerDetails: React.FC<Props> = ({ video, bottomSpace, onOpenSettings }) => {
  const provider = getProviderMeta(video.providerId);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const isFavorite = useLibraryStore((state) => state.isFavorite(video.uid));

  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const resumeFrom = usePlayerStore((state) => state.resumeFrom);
  // Селектор возвращает булево, а не позицию: подписка на `positionSec`
  // перерисовывала бы весь блок с очередью дважды в секунду.
  const resumeVisible = usePlayerStore(
    (state) => state.resumeFrom !== null && state.positionSec - state.resumeFrom < 30,
  );
  const open = usePlayerStore((state) => state.open);
  const restart = usePlayerStore((state) => state.restart);

  const upNext = queue.slice(queueIndex + 1, queueIndex + 21);

  const metaLine = [
    formatViews(video.viewCount) && `${formatViews(video.viewCount)} просмотров`,
    formatPublishedAt(video.publishedAt),
    formatDuration(video.durationSec),
  ]
    .filter(Boolean)
    .join(' · ');

  const share = () => {
    void Share.share({
      message: video.webUrl ? `${video.title}\n${video.webUrl}` : video.title,
    });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: bottomSpace + spacing.xl }]}
      showsVerticalScrollIndicator={false}>
      {/* Продолжение просмотра показывается ссылкой, а не диалогом: диалог
          пришлось бы закрывать до того, как видео вообще начнётся. */}
      {resumeVisible ? (
        <View style={styles.resumeRow}>
          <Icon name="clock" size={14} color={colors.accent} />
          <Text style={styles.resumeText}>{`Продолжаем с ${formatClock(resumeFrom ?? 0)}`}</Text>
          <Pressable onPress={restart} hitSlop={8} accessibilityRole="button">
            <Text style={styles.resumeAction}>Сначала</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.title}>{video.title}</Text>

      <View style={styles.providerRow}>
        <ProviderBadge label={provider.badge} color={provider.accentColor} />
        <Text style={styles.meta} numberOfLines={1}>
          {metaLine || provider.title}
        </Text>
        {video.access !== 'free' ? (
          <View style={styles.accessTag}>
            <Icon name="lock" size={12} color={colors.warning} />
            <Text style={styles.accessTagText}>
              {video.access === 'paid' ? 'По подписке платформы' : 'С ограничением'}
            </Text>
          </View>
        ) : null}
      </View>

      {video.author?.name ? (
        <Pressable
          style={styles.authorRow}
          disabled={!video.author.url}
          accessibilityRole={video.author.url ? 'link' : 'text'}
          onPress={() => {
            if (video.author?.url) {
              void Linking.openURL(video.author.url);
            }
          }}>
          {video.author.avatarUrl ? (
            <Image source={{ uri: video.author.avatarUrl }} style={styles.authorAvatar} />
          ) : (
            <View style={[styles.authorAvatar, { backgroundColor: provider.accentColor }]}>
              <Text style={styles.authorInitial}>
                {video.author.name.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.author} numberOfLines={1}>
            {video.author.name}
          </Text>
          {video.author.url ? (
            <Icon name="chevronRight" size={16} color={colors.textMuted} />
          ) : null}
        </Pressable>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actions}>
        <ActionChip
          icon={isFavorite ? 'starFilled' : 'star'}
          label={isFavorite ? 'В избранном' : 'В избранное'}
          active={isFavorite}
          onPress={() => {
            void toggleFavorite(video);
          }}
        />
        <ActionChip icon="share" label="Поделиться" onPress={share} />
        <ActionChip icon="settings" label="Плеер" onPress={onOpenSettings} />
        {video.webUrl ? (
          <ActionChip
            icon="external"
            label="На сайте"
            onPress={() => {
              void Linking.openURL(video.webUrl as string);
            }}
          />
        ) : null}
      </ScrollView>

      {video.description ? (
        <Pressable
          style={styles.descriptionBox}
          onPress={() => setDescriptionExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={descriptionExpanded ? 'Свернуть описание' : 'Развернуть описание'}>
          <View style={styles.descriptionHeader}>
            <Text style={styles.descriptionLabel}>Описание</Text>
            <Icon
              name={descriptionExpanded ? 'chevronUp' : 'chevronDown'}
              size={16}
              color={colors.textMuted}
            />
          </View>
          <Text style={styles.description} numberOfLines={descriptionExpanded ? undefined : 3}>
            {video.description}
          </Text>
        </Pressable>
      ) : null}

      {upNext.length > 0 ? (
        <View style={styles.queue}>
          <View style={styles.queueHeader}>
            <Icon name="queue" size={16} color={colors.textMuted} />
            <Text style={styles.queueTitle}>Далее</Text>
            <Text style={styles.queueCount}>{`${queueIndex + 1} из ${queue.length}`}</Text>
          </View>
          {upNext.map((item) => (
            <QueueRow key={item.uid} video={item} onPress={() => open(item, queue)} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
};

const ActionChip: React.FC<{
  readonly icon: IconName;
  readonly label: string;
  readonly active?: boolean;
  readonly onPress: () => void;
}> = ({ icon, label, active = false, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}>
    <Icon name={icon} size={16} color={active ? colors.accent : colors.textSecondary} />
    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
  </Pressable>
);

const QueueRow: React.FC<{ readonly video: VideoSummary; readonly onPress: () => void }> = ({
  video,
  onPress,
}) => {
  const provider = getProviderMeta(video.providerId);
  const duration = formatDuration(video.durationSec);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${video.title}, платформа ${provider.title}`}
      style={({ pressed }) => [styles.queueRow, pressed && styles.pressed]}>
      <View style={styles.queueThumbWrapper}>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} style={styles.queueThumb} />
        ) : (
          <View style={[styles.queueThumb, styles.queueThumbFallback]}>
            <Icon name="playFilled" size={16} color={colors.textMuted} />
          </View>
        )}
        {duration ? (
          <View style={styles.queueDuration}>
            <Text style={styles.queueDurationText}>{duration}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.queueBody}>
        <Text style={styles.queueRowTitle} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={styles.queueRowMeta} numberOfLines={1}>
          {[video.author?.name, provider.title].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resumeText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  resumeAction: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  accessTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  accessTagText: {
    ...typography.caption,
    color: colors.warning,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authorAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  authorInitial: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
  author: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  actions: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  descriptionBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  descriptionLabel: {
    ...typography.overline,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  queue: {
    gap: spacing.sm,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  queueTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  queueCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  queueRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  queueThumbWrapper: {
    width: 128,
    aspectRatio: 16 / 9,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  queueThumb: {
    width: '100%',
    height: '100%',
  },
  queueThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueDuration: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    backgroundColor: colors.scrim,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.xs,
  },
  queueDurationText: {
    ...typography.badge,
    color: colors.white,
  },
  queueBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  queueRowTitle: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  queueRowMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
