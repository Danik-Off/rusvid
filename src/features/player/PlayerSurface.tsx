import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Video, {
  SelectedTrackType,
  SelectedVideoTrackType,
  type OnAudioTracksData,
  type OnBufferData,
  type OnLoadData,
  type OnProgressData,
  type OnTextTracksData,
  type OnVideoErrorData,
  type OnVideoTracksData,
  type VideoRef,
} from 'react-native-video';
import { WebView } from 'react-native-webview';

import type { PlaybackSource } from '../../core/model/media';
import { LoadingView } from '../../ui/components/StateViews';
import { absoluteFill, colors } from '../../ui/theme';
import { useSettingsStore } from '../settings/settingsStore';
import {
  attachVideoRef,
  resolveQualityTrack,
  usePlayerStore,
  type TrackOption,
} from './playerStore';

interface Props {
  readonly source: PlaybackSource;
  readonly onFailure: (message: string) => void;
}

/**
 * Сам холст воспроизведения.
 *
 * Вынесен отдельно от элементов управления, потому что живёт по другим
 * правилам: этот компонент не должен размонтироваться ни при сворачивании
 * плеера, ни при переходе в полноэкранный режим — иначе поток
 * переоткрывается и звук обрывается.
 */
export const PlayerSurface: React.FC<Props> = ({ source, onFailure }) => {
  if (source.kind === 'embed') {
    return <EmbedSurface source={source} onFailure={onFailure} />;
  }
  return <NativeSurface source={source} onFailure={onFailure} />;
};

const NativeSurface: React.FC<Props> = ({ source, onFailure }) => {
  const ref = useRef<VideoRef | null>(null);
  const player = usePlayerStore();
  const settings = useSettingsStore((state) => state.settings);

  useEffect(() => {
    attachVideoRef(ref.current);
    return () => attachVideoRef(null);
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    usePlayerStore.getState().onProgress(data.currentTime, data.playableDuration);
  }, []);

  const onLoad = useCallback((data: OnLoadData) => {
    usePlayerStore.getState().onLoaded({
      durationSec: data.duration,
      videoTracks: mapVideoTracks(data.videoTracks),
      audioTracks: mapAudioTracks(data.audioTracks),
      textTracks: mapTextTracks(data.textTracks),
    });
  }, []);

  const quality = resolveQualityTrack(player.videoTracks, player.quality);
  const { startPositionSec, current } = player;

  /**
   * Источник обязан быть мемоизирован.
   *
   * Компонент перерисовывается дважды в секунду (позиция воспроизведения), а
   * `react-native-video` считает новый объект источника новым видео: без
   * `useMemo` поток переоткрывался бы на каждом тике прогресса и не играл
   * вообще. Зависимости стабильны в пределах ролика.
   */
  const videoSource = useMemo(
    () => ({
      uri: source.url,
      // ВАЖНО: без явного типа ExoPlayer определяет формат по расширению
      // в пути. У Sasflix манифест лежит по URL без расширения
      // (`/api/video/{uuid}`), и поток уходил бы в progressive-ветку и падал.
      type: source.kind === 'hls' ? 'm3u8' : undefined,
      headers: source.headers as Record<string, string> | undefined,
      // Продолжение просмотра задаётся источником, а не перемоткой после
      // старта: так ExoPlayer сразу буферизует нужный кусок и не показывает
      // полсекунды начала ролика.
      startPosition: startPositionSec > 0 ? Math.round(startPositionSec * 1000) : undefined,
      // Заголовок и обложка уходят в MediaSession — это то, что видно
      // в шторке и на экране блокировки при фоновом воспроизведении.
      metadata: {
        title: current?.title,
        artist: current?.author?.name,
        imageUri: current?.thumbnailUrl,
      },
    }),
    [source, startPositionSec, current],
  );

  return (
    <Video
      ref={(instance) => {
        ref.current = instance;
        attachVideoRef(instance);
      }}
      source={videoSource}
      style={styles.surface}
      // Свои элементы управления — системные не поддаются оформлению.
      controls={false}
      paused={player.paused}
      rate={player.rate}
      muted={player.muted}
      volume={player.volume}
      repeat={player.repeat}
      resizeMode={player.resizeMode}
      progressUpdateInterval={500}
      playInBackground={settings.backgroundPlayback}
      showNotificationControls={settings.backgroundPlayback}
      enterPictureInPictureOnLeave={settings.pictureInPicture}
      preventsDisplaySleepDuringVideoPlayback
      selectedVideoTrack={
        quality.type === 'auto'
          ? { type: SelectedVideoTrackType.AUTO }
          : { type: SelectedVideoTrackType.RESOLUTION, value: quality.value }
      }
      selectedAudioTrack={
        player.audioTrack === 'auto'
          ? { type: SelectedTrackType.SYSTEM }
          : { type: SelectedTrackType.INDEX, value: player.audioTrack }
      }
      selectedTextTrack={
        player.textTrack === null
          ? { type: SelectedTrackType.DISABLED }
          : { type: SelectedTrackType.INDEX, value: player.textTrack }
      }
      onLoad={onLoad}
      onProgress={onProgress}
      onBuffer={(data: OnBufferData) => usePlayerStore.getState().setBuffering(data.isBuffering)}
      onReadyForDisplay={() => usePlayerStore.getState().setBuffering(false)}
      onEnd={() => usePlayerStore.getState().onEnded()}
      onVideoTracks={(data: OnVideoTracksData) =>
        usePlayerStore.setState({ videoTracks: mapVideoTracks(data.videoTracks) })
      }
      onAudioTracks={(data: OnAudioTracksData) =>
        usePlayerStore.setState({ audioTracks: mapAudioTracks(data.audioTracks) })
      }
      onTextTracks={(data: OnTextTracksData) =>
        usePlayerStore.setState({ textTracks: mapTextTracks(data.textTracks) })
      }
      onError={(event: OnVideoErrorData) => onFailure(describeVideoError(event))}
    />
  );
};

const EmbedSurface: React.FC<Props> = ({ source, onFailure }) => {
  const [loading, setLoading] = useState(true);

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
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          onFailure('Встроенный плеер платформы не загрузился');
        }}
        onHttpError={(event: unknown) => {
          setLoading(false);
          onFailure(describeHttpError(event));
        }}
      />
      {loading ? (
        <View style={styles.overlay}>
          <LoadingView />
        </View>
      ) : null}
    </View>
  );
};

function mapVideoTracks(tracks: OnLoadData['videoTracks'] | undefined): TrackOption[] {
  return (tracks ?? []).map((track) => ({
    index: track.index,
    height: track.height,
    label: track.height ? `${track.height}p` : `Дорожка ${track.index + 1}`,
  }));
}

function mapAudioTracks(tracks: OnLoadData['audioTracks'] | undefined): TrackOption[] {
  return (tracks ?? []).map((track) => ({
    index: track.index,
    language: track.language,
    label: track.title ?? track.language ?? `Дорожка ${track.index + 1}`,
  }));
}

function mapTextTracks(tracks: OnLoadData['textTracks'] | undefined): TrackOption[] {
  return (tracks ?? []).map((track) => ({
    index: track.index,
    language: track.language,
    label: track.title ?? track.language ?? `Субтитры ${track.index + 1}`,
  }));
}

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
  surface: {
    flex: 1,
    backgroundColor: colors.black,
  },
  overlay: {
    ...absoluteFill,
    backgroundColor: colors.black,
    justifyContent: 'center',
  },
});
