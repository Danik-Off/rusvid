import React, { useState } from 'react';

import { PLAYBACK_RATES } from '../../data/settings/AppSettings';
import { Sheet, SheetRow, SheetSection } from '../../ui/components/Sheet';
import { plural } from '../../core/utils/format';
import { usePlayerStore } from './playerStore';
import { screenControl } from './screenControl';
import { qualityLadder } from './tracks';

type Page = 'root' | 'speed' | 'quality' | 'subtitles' | 'audio' | 'sleep';

const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60];

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Свернуть видео в системное окно «картинка в картинке». */
  readonly onPictureInPicture: () => void;
}

/**
 * Меню «⋮» плеера: скорость, качество, дорожки, вписывание кадра,
 * повтор и таймер сна.
 *
 * Разделы вложенные, как в больших плеерах: корневой список показывает
 * текущее значение, тап уводит на выбор. Плоский список из тридцати строк
 * поверх видео пришлось бы прокручивать, теряя кадр из виду.
 */
export const PlayerSettingsSheet: React.FC<Props> = ({ visible, onClose, onPictureInPicture }) => {
  const [page, setPage] = useState<Page>('root');
  const player = usePlayerStore();

  const close = () => {
    setPage('root');
    onClose();
  };

  if (page === 'speed') {
    return (
      <Sheet visible={visible} title="Скорость" onClose={close}>
        {PLAYBACK_RATES.map((rate) => (
          <SheetRow
            key={rate}
            label={rate === 1 ? 'Обычная' : `${formatRate(rate)}×`}
            selected={player.rate === rate}
            onPress={() => {
              player.setRate(rate);
              setPage('root');
            }}
          />
        ))}
      </Sheet>
    );
  }

  if (page === 'quality') {
    return (
      <Sheet visible={visible} title="Качество" onClose={close}>
        <SheetRow
          label="Авто"
          value="по скорости сети"
          selected={player.quality === 'auto'}
          onPress={() => {
            player.setQuality('auto');
            setPage('root');
          }}
        />
        {qualityLadder(player.videoTracks).map((height) => (
          <SheetRow
            key={height}
            label={`${height}p`}
            selected={player.quality === height}
            onPress={() => {
              player.setQuality(height);
              setPage('root');
            }}
          />
        ))}
      </Sheet>
    );
  }

  if (page === 'subtitles') {
    return (
      <Sheet visible={visible} title="Субтитры" onClose={close}>
        <SheetRow
          label="Выключены"
          selected={player.textTrack === null}
          onPress={() => {
            player.setTextTrack(null);
            setPage('root');
          }}
        />
        {player.textTracks.map((track) => (
          <SheetRow
            key={track.index}
            label={track.label}
            selected={player.textTrack === track.index}
            onPress={() => {
              player.setTextTrack(track.index);
              setPage('root');
            }}
          />
        ))}
      </Sheet>
    );
  }

  if (page === 'audio') {
    return (
      <Sheet visible={visible} title="Звуковая дорожка" onClose={close}>
        <SheetRow
          label="Авто"
          selected={player.audioTrack === 'auto'}
          onPress={() => {
            player.setAudioTrack('auto');
            setPage('root');
          }}
        />
        {player.audioTracks.map((track) => (
          <SheetRow
            key={track.index}
            label={track.label}
            selected={player.audioTrack === track.index}
            onPress={() => {
              player.setAudioTrack(track.index);
              setPage('root');
            }}
          />
        ))}
      </Sheet>
    );
  }

  if (page === 'sleep') {
    return (
      <Sheet visible={visible} title="Таймер сна" onClose={close}>
        <SheetRow
          label="Выключен"
          selected={player.sleepTimer.kind === 'off'}
          onPress={() => {
            player.setSleepTimer({ kind: 'off' });
            setPage('root');
          }}
        />
        {SLEEP_MINUTES.map((minutes) => (
          <SheetRow
            key={minutes}
            label={`${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`}
            selected={player.sleepTimer.kind === 'at' && player.sleepTimer.minutes === minutes}
            onPress={() => {
              player.setSleepTimer({ kind: 'at', minutes, at: Date.now() + minutes * 60_000 });
              setPage('root');
            }}
          />
        ))}
        <SheetRow
          label="До конца видео"
          selected={player.sleepTimer.kind === 'endOfVideo'}
          onPress={() => {
            player.setSleepTimer({ kind: 'endOfVideo' });
            setPage('root');
          }}
        />
      </Sheet>
    );
  }

  const ladder = qualityLadder(player.videoTracks);

  return (
    <Sheet visible={visible} title="Плеер" onClose={close}>
      <SheetSection title="Воспроизведение">
        <SheetRow
          icon="speed"
          label="Скорость"
          value={player.rate === 1 ? 'Обычная' : `${formatRate(player.rate)}×`}
          onPress={() => setPage('speed')}
        />
        <SheetRow
          icon="quality"
          label="Качество"
          value={
            ladder.length === 0
              ? 'Недоступно'
              : player.quality === 'auto'
                ? 'Авто'
                : `${player.quality}p`
          }
          onPress={() => (ladder.length > 0 ? setPage('quality') : undefined)}
        />
        <SheetRow
          icon="repeat"
          label="Повторять видео"
          value={player.repeat ? 'Включено' : 'Выключено'}
          onPress={player.toggleRepeat}
        />
        <SheetRow
          icon="fit"
          label="Кадр"
          value={player.resizeMode === 'contain' ? 'Целиком' : 'На весь экран'}
          onPress={() => player.setResizeMode(player.resizeMode === 'contain' ? 'cover' : 'contain')}
        />
      </SheetSection>

      <SheetSection title="Дорожки">
        <SheetRow
          icon="subtitles"
          label="Субтитры"
          value={
            player.textTracks.length === 0
              ? 'Нет'
              : player.textTrack === null
                ? 'Выключены'
                : (player.textTracks.find((track) => track.index === player.textTrack)?.label ??
                  'Включены')
          }
          onPress={() => (player.textTracks.length > 0 ? setPage('subtitles') : undefined)}
        />
        <SheetRow
          icon="volume"
          label="Звуковая дорожка"
          value={
            player.audioTracks.length <= 1
              ? 'Одна'
              : player.audioTrack === 'auto'
                ? 'Авто'
                : (player.audioTracks.find((track) => track.index === player.audioTrack)?.label ??
                  'Выбрана')
          }
          onPress={() => (player.audioTracks.length > 1 ? setPage('audio') : undefined)}
        />
      </SheetSection>

      <SheetSection title="Сеанс">
        <SheetRow
          icon="timer"
          label="Таймер сна"
          value={describeSleepTimer(player.sleepTimer)}
          onPress={() => setPage('sleep')}
        />
        <SheetRow
          icon="pip"
          label="Картинка в картинке"
          value="Свернуть в окно"
          onPress={() => {
            close();
            onPictureInPicture();
          }}
        />
        {/* Молчаливая деградация — худший вид поломки: «не поворачивает и не
            прячет кнопки» выглядит как баг плеера, хотя причина в сборке.
            Поэтому отсутствие нативного модуля видно прямо здесь. */}
        {screenControl.available ? null : (
          <SheetRow
            icon="alert"
            label="Полноэкранный режим ограничен"
            value="модуль не собран"
            onPress={() => undefined}
          />
        )}
      </SheetSection>
    </Sheet>
  );
};

/** «1,25» вместо «1.25» — в подписи скорости нужна русская запятая. */
function formatRate(rate: number): string {
  return String(rate).replace('.', ',');
}

function describeSleepTimer(timer: ReturnType<typeof usePlayerStore.getState>['sleepTimer']): string {
  if (timer.kind === 'endOfVideo') {
    return 'До конца видео';
  }
  if (timer.kind === 'at') {
    const left = Math.max(0, Math.round((timer.at - Date.now()) / 60_000));
    return `${left} ${plural(left, 'минута', 'минуты', 'минут')}`;
  }
  return 'Выключен';
}
