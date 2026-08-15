import { useCallback, useEffect, useMemo, useState } from 'react';

import { getAppContainer } from '../../app/container/AppContainer';
import { ProviderError } from '../../core/errors/ProviderError';
import type { PlaybackSource, VideoSummary } from '../../core/model/media';
import { useSettingsStore } from '../settings/settingsStore';

type Status = 'resolving' | 'ready' | 'error';

export interface PlaybackState {
  readonly status: Status;
  readonly source: PlaybackSource | null;
  readonly error: string | null;
  /** Играем во встроенном плеере платформы, а не нативно. */
  readonly isEmbed: boolean;
  /** Доступен ли переход на встроенный плеер платформы. */
  readonly canUseEmbed: boolean;
  retry: () => void;
  useEmbed: () => void;
  /**
   * Сообщить о сбое уже начавшегося воспроизведения (ExoPlayer/WebView).
   * Если у платформы есть веб-плеер, переключаемся на него автоматически —
   * одного «ничего не происходит» пользователю достаточно.
   */
  reportPlaybackFailure: (message: string) => void;
}

/**
 * Разрешение ссылки на воспроизведение.
 *
 * Ссылки Rutube подписаны и живут недолго, поэтому запрашиваются в момент
 * открытия экрана, а не сохраняются вместе с карточкой.
 */
export function usePlayback(video: VideoSummary): PlaybackState {
  const preferNativePlayer = useSettingsStore((state) => state.settings.preferNativePlayer);
  const [forceEmbed, setForceEmbed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('resolving');
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registry = getAppContainer().registry;
  // В истории могут лежать карточки платформы, которой больше нет в сборке.
  const provider = useMemo(
    () => (registry.has(video.providerId) ? registry.get(video.providerId) : null),
    [registry, video.providerId],
  );

  const preferEmbed = forceEmbed || !preferNativePlayer;

  useEffect(() => {
    if (!provider) {
      setStatus('error');
      setError('Платформа этого видео не поддерживается текущей версией приложения');
      return;
    }

    const controller = new AbortController();
    setStatus('resolving');
    setError(null);

    provider
      .resolvePlayback({ id: video.id, preferEmbed }, { signal: controller.signal })
      .then((resolved) => {
        if (controller.signal.aborted) {
          return;
        }
        setSource(resolved);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setSource(null);
        setError(ProviderError.from(cause, video.providerId).message);
        setStatus('error');
      });

    return () => controller.abort();
  }, [provider, video.id, video.providerId, preferEmbed, attempt]);

  const retry = useCallback(() => {
    setForceEmbed(false);
    setAttempt((value) => value + 1);
  }, []);

  const useEmbed = useCallback(() => {
    setForceEmbed(true);
    setError(null);
  }, []);

  const isEmbed = source?.kind === 'embed';
  const canUseEmbed = provider?.capabilities.embedPlayback === true && !isEmbed;

  const reportPlaybackFailure = useCallback(
    (message: string) => {
      if (canUseEmbed) {
        setForceEmbed(true);
        setError(null);
        return;
      }
      setStatus('error');
      setError(message);
    },
    [canUseEmbed],
  );

  return {
    status,
    source,
    error,
    isEmbed,
    canUseEmbed,
    retry,
    useEmbed,
    reportPlaybackFailure,
  };
}
