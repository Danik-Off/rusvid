import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Video, { type OnProgressData, type OnVideoErrorData } from 'react-native-video';
import { WebView } from 'react-native-webview';

import { getProviderMeta } from '../../app/container/providerMeta';
import type { PlayerScreenProps } from '../../app/navigation/types';
import type { PlaybackSource } from '../../core/model/media';
import { formatDuration, formatPublishedAt, formatViews } from '../../core/utils/format';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { ProviderBadge } from '../../ui/components/ProviderBadge';
import { ErrorView, LoadingView } from '../../ui/components/StateViews';
import { colors, radius, spacing, typography } from '../../ui/theme';
import { useLibraryStore } from '../library/libraryStore';
import { usePlayback } from './usePlayback';

export const PlayerScreen: React.FC<PlayerScreenProps> = ({ route }) => {
  const { video } = route.params;
  const playback = usePlayback(video);
  const provider = getProviderMeta(video.providerId);

  const recordWatch = useLibraryStore((state) => state.recordWatch);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const isFavorite = useLibraryStore((state) => state.isFavorite(video.uid));

  // Позицию пишем в ref, а не в state: onProgress срабатывает ~4 раза в секунду,
  // и перерисовывать на каждый тик весь экран не нужно.
  const positionRef = useRef(0);

  useEffect(() => {
    void recordWatch(video, 0);
    return () => {
      void recordWatch(video, positionRef.current);
    };
  }, [video, recordWatch]);

  const onProgress = useCallback((data: OnProgressData) => {
    positionRef.current = data.currentTime;
  }, []);

  const metaLine = [
    formatViews(video.viewCount) && `${formatViews(video.viewCount)} просмотров`,
    formatPublishedAt(video.publishedAt),
    formatDuration(video.durationSec),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.playerBox}>
        <PlayerSurface
          status={playback.status}
          source={playback.source}
          error={playback.error}
          onRetry={playback.retry}
          onProgress={onProgress}
          canUseEmbed={playback.canUseEmbed}
          onUseEmbed={playback.useEmbed}
          onFailure={playback.reportPlaybackFailure}
        />
      </View>

      {playback.isEmbed && playback.status === 'ready' ? (
        <View style={styles.embedNotice}>
          <Icon name="alert" size={14} color={colors.textMuted} />
          <Text style={styles.embedNoticeText}>
            Воспроизведение во встроенном плеере {provider.title}
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.info}>
        <View style={styles.providerRow}>
          <ProviderBadge label={provider.badge} color={provider.accentColor} />
          <Text style={styles.providerName}>{provider.title}</Text>
          {video.access !== 'free' ? (
            <View style={styles.accessTag}>
              <Icon name="lock" size={12} color={colors.warning} />
              <Text style={styles.accessTagText}>
                {video.access === 'paid' ? 'По подписке платформы' : 'С ограничением'}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.title}>{video.title}</Text>
        {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
        {video.author?.name ? (
          <View style={styles.authorRow}>
            <View style={[styles.authorAvatar, { backgroundColor: provider.accentColor }]}>
              <Text style={styles.authorInitial}>
                {video.author.name.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.author} numberOfLines={1}>
              {video.author.name}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={isFavorite ? 'В избранном' : 'В избранное'}
            icon={isFavorite ? 'starFilled' : 'star'}
            variant={isFavorite ? 'primary' : 'secondary'}
            onPress={() => {
              void toggleFavorite(video);
            }}
          />
          {video.webUrl ? (
            <Button
              label="На сайте"
              icon="external"
              onPress={() => {
                void Linking.openURL(video.webUrl as string);
              }}
            />
          ) : null}
        </View>

        {video.description ? (
          <View style={styles.descriptionBox}>
            <Text style={styles.descriptionLabel}>Описание</Text>
            <Text style={styles.description}>{video.description}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

interface PlayerSurfaceProps {
  readonly status: 'resolving' | 'ready' | 'error';
  readonly source: PlaybackSource | null;
  readonly error: string | null;
  readonly onRetry: () => void;
  readonly onProgress: (data: OnProgressData) => void;
  readonly canUseEmbed: boolean;
  readonly onUseEmbed: () => void;
  readonly onFailure: (message: string) => void;
}

const PlayerSurface: React.FC<PlayerSurfaceProps> = ({
  status,
  source,
  error,
  onRetry,
  onProgress,
  canUseEmbed,
  onUseEmbed,
  onFailure,
}) => {
  const [webViewLoading, setWebViewLoading] = useState(true);

  if (status === 'resolving') {
    return <LoadingView label="Получаем ссылку на видео…" />;
  }
  if (status === 'error' || !source) {
    return (
      <ErrorView
        message={error ?? 'Не удалось загрузить видео'}
        onRetry={onRetry}
        secondaryLabel={canUseEmbed ? 'Плеер платформы' : undefined}
        onSecondary={canUseEmbed ? onUseEmbed : undefined}
      />
    );
  }

  if (source.kind === 'embed') {
    return (
      <View style={styles.surface}>
        <WebView
          source={{ uri: source.url, headers: source.headers }}
          style={styles.surface}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          // Автозапуск: иначе внутри WebView нужен второй тап по плееру.
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          onLoadEnd={() => setWebViewLoading(false)}
          onError={() => {
            setWebViewLoading(false);
            onFailure('Встроенный плеер платформы не загрузился');
          }}
          onHttpError={(event: unknown) => {
            setWebViewLoading(false);
            onFailure(describeHttpError(event));
          }}
        />
        {webViewLoading ? (
          <View style={styles.webViewOverlay}>
            <LoadingView />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Video
      source={{
        uri: source.url,
        // ВАЖНО: без явного типа ExoPlayer определяет формат по расширению
        // в пути. У Sasflix манифест лежит по URL без расширения
        // (`/api/video/{uuid}`), и поток уходил бы в progressive-ветку и падал.
        type: source.kind === 'hls' ? 'm3u8' : undefined,
        headers: source.headers as Record<string, string> | undefined,
      }}
      style={styles.surface}
      controls
      resizeMode="contain"
      onProgress={onProgress}
      onError={(event: OnVideoErrorData) => onFailure(describeVideoError(event))}
    />
  );
};

/**
 * Тип события `onHttpError` в d.ts react-native-webview объявлен как
 * пересечение двух несовместимых сигнатур, поэтому читаем поле защитно,
 * а не подгоняем аннотацию под сломанный тип.
 */
function describeHttpError(event: unknown): string {
  const status = (event as { nativeEvent?: { statusCode?: number } } | null)?.nativeEvent
    ?.statusCode;
  return status
    ? `Плеер платформы вернул ошибку ${status}`
    : 'Встроенный плеер платформы не отвечает';
}

/** Приводим объект ошибки ExoPlayer к строке, понятной пользователю. */
function describeVideoError(event: OnVideoErrorData): string {
  const raw = event?.error as { errorString?: string; errorException?: string } | undefined;
  const detail = raw?.errorString ?? raw?.errorException;
  return detail ? `Плеер не смог открыть поток: ${detail}` : 'Плеер не смог открыть поток';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  playerBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.black,
    justifyContent: 'center',
  },
  surface: {
    flex: 1,
    backgroundColor: colors.black,
  },
  webViewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.black,
    justifyContent: 'center',
  },
  embedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSunken,
  },
  embedNoticeText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  info: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  providerName: {
    ...typography.caption,
    color: colors.textMuted,
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
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authorAvatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  descriptionBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
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
});
