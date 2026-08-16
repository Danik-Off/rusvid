/**
 * Состояние воспроизведения — глобальное, а не экранное.
 *
 * До этого плеер был обычным экраном стека: уход назад размонтировал
 * `<Video>` и обрывал звук, а «свернуть и листать ленту» было невозможно
 * в принципе. Теперь единственный экземпляр плеера живёт над навигатором
 * (`PlayerOverlay`), а этот стор — единственный источник правды о том,
 * что играет, в каком режиме и с какими настройками дорожек.
 *
 * Команды, которые нельзя выразить состоянием (перемотка, вход в PiP),
 * идут в императивный ref — см. {@link attachVideoRef}.
 */

import type { VideoRef } from 'react-native-video';
import { create } from 'zustand';

import type { VideoSummary } from '../../core/model/media';
import { useLibraryStore } from '../library/libraryStore';
import { useSettingsStore } from '../settings/settingsStore';
import type { QualitySelection, TrackOption } from './tracks';

export type { QualitySelection, TrackOption } from './tracks';
export { qualityLadder, resolveQualityTrack } from './tracks';

/**
 * - `hidden` — плеера нет;
 * - `mini`   — полоска над таб-баром, звук идёт, приложением можно пользоваться;
 * - `full`   — плеер на весь экран вместе с описанием и очередью;
 * - `fullscreen` — только кадр, системные полосы спрятаны.
 */
export type PlayerMode = 'hidden' | 'mini' | 'full' | 'fullscreen';

export type ResizeMode = 'contain' | 'cover';

/** Куда должен уехать таймер сна. */
export type SleepTimer =
  | { readonly kind: 'off' }
  | { readonly kind: 'at'; readonly at: number; readonly minutes: number }
  | { readonly kind: 'endOfVideo' };

interface PlayerState {
  readonly current: VideoSummary | null;
  /** Очередь «Далее» — список, из которого открыли видео. */
  readonly queue: readonly VideoSummary[];
  readonly queueIndex: number;
  readonly mode: PlayerMode;

  readonly paused: boolean;
  readonly ended: boolean;
  readonly buffering: boolean;
  readonly positionSec: number;
  readonly durationSec: number;
  readonly bufferedSec: number;
  /**
   * С какой секунды стартовать текущий источник.
   *
   * Уходит прямо в `source.startPosition`, поэтому меняется только при смене
   * видео: любое изменение перезапускает поток с новой точки.
   */
  readonly startPositionSec: number;
  /**
   * Позиция, с которой продолжили просмотр, — только ради плашки
   * «продолжаем с 12:34». Отдельно от {@link startPositionSec} именно потому,
   * что её надо гасить по кнопке «Сначала», не трогая источник.
   */
  readonly resumeFrom: number | null;

  readonly rate: number;
  readonly muted: boolean;
  readonly volume: number;
  /** Программное затемнение кадра 0..0.85 — «яркость» без системных прав. */
  readonly dim: number;
  readonly resizeMode: ResizeMode;
  readonly repeat: boolean;

  readonly videoTracks: readonly TrackOption[];
  readonly audioTracks: readonly TrackOption[];
  readonly textTracks: readonly TrackOption[];
  readonly quality: QualitySelection;
  readonly audioTrack: QualitySelection;
  /** `null` — субтитры выключены. */
  readonly textTrack: number | null;

  /**
   * Блокировка управления в полноэкранном режиме.
   *
   * Экран продолжает показывать видео, но не реагирует ни на касания, ни на
   * жесты — кроме кнопки снятия блокировки. Нужно там, где телефон держат
   * в руке или он лежит рядом: случайный контакт с экраном иначе ставит
   * паузу или перематывает.
   */
  readonly locked: boolean;
  readonly sleepTimer: SleepTimer;
  /** Видео, которое запустится по окончании текущего; UI рисует обратный отсчёт. */
  readonly pendingNext: VideoSummary | null;

  open: (video: VideoSummary, queue?: readonly VideoSummary[]) => void;
  close: () => void;
  setMode: (mode: PlayerMode) => void;

  setPaused: (paused: boolean) => void;
  togglePlay: () => void;
  /** Перемотка на абсолютную секунду. */
  seekTo: (sec: number) => void;
  /** Перемотка на `delta` секунд от текущей позиции. */
  seekBy: (delta: number) => void;

  onLoaded: (payload: {
    durationSec: number;
    videoTracks: readonly TrackOption[];
    audioTracks: readonly TrackOption[];
    textTracks: readonly TrackOption[];
  }) => void;
  onProgress: (positionSec: number, bufferedSec: number) => void;
  onEnded: () => void;
  setBuffering: (buffering: boolean) => void;

  setRate: (rate: number) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setDim: (dim: number) => void;
  setResizeMode: (mode: ResizeMode) => void;
  toggleRepeat: () => void;
  setQuality: (quality: QualitySelection) => void;
  setAudioTrack: (track: QualitySelection) => void;
  setTextTrack: (index: number | null) => void;
  setSleepTimer: (timer: SleepTimer) => void;
  setLocked: (locked: boolean) => void;

  playNext: () => void;
  playPrevious: () => void;
  /** Отменить автопереход к следующему видео. */
  cancelPendingNext: () => void;
  /** Сбросить позицию и начать текущее видео сначала. */
  restart: () => void;
}

let videoRef: VideoRef | null = null;

/** Плеер отдаёт сюда свой ref: перемотка и PiP не выражаются состоянием. */
export function attachVideoRef(ref: VideoRef | null): void {
  videoRef = ref;
}

export function getVideoRef(): VideoRef | null {
  return videoRef;
}

/** Состояние, которое обнуляется при переходе к другому видео. */
const PER_VIDEO_DEFAULTS = {
  paused: false,
  ended: false,
  buffering: true,
  positionSec: 0,
  durationSec: 0,
  bufferedSec: 0,
  videoTracks: [] as readonly TrackOption[],
  audioTracks: [] as readonly TrackOption[],
  textTracks: [] as readonly TrackOption[],
  audioTrack: 'auto' as QualitySelection,
  textTrack: null as number | null,
  pendingNext: null as VideoSummary | null,
} as const;

export const usePlayerStore = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  queueIndex: -1,
  mode: 'hidden',
  startPositionSec: 0,
  resumeFrom: null,

  rate: 1,
  muted: false,
  volume: 1,
  dim: 0,
  resizeMode: 'contain',
  repeat: false,
  quality: 'auto',
  locked: false,
  sleepTimer: { kind: 'off' },
  ...PER_VIDEO_DEFAULTS,

  open: (video, queue) => {
    const previous = get().current;
    if (previous && previous.uid !== video.uid) {
      flushProgress(previous, get().positionSec);
    }

    const settings = useSettingsStore.getState().settings;
    const list = queue && queue.length > 0 ? queue : [video];
    const index = list.findIndex((item) => item.uid === video.uid);
    const resumeAt = settings.resumePlayback
      ? useLibraryStore.getState().resumePositionOf(video)
      : null;

    set({
      ...PER_VIDEO_DEFAULTS,
      current: video,
      queue: list,
      queueIndex: index >= 0 ? index : 0,
      mode: 'full',
      startPositionSec: resumeAt ?? 0,
      resumeFrom: resumeAt,
      positionSec: resumeAt ?? 0,
      durationSec: video.durationSec ?? 0,
      rate: settings.defaultRate,
      quality: settings.preferredQuality,
      // Таймер сна переживает смену видео намеренно: «выключись через 30 минут»
      // относится к сеансу, а не к конкретному ролику.
      sleepTimer: get().sleepTimer,
    });
  },

  close: () => {
    const { current, positionSec } = get();
    if (current) {
      flushProgress(current, positionSec);
    }
    set({
      ...PER_VIDEO_DEFAULTS,
      current: null,
      queue: [],
      queueIndex: -1,
      mode: 'hidden',
      startPositionSec: 0,
      resumeFrom: null,
      dim: 0,
      locked: false,
      sleepTimer: { kind: 'off' },
    });
  },

  setMode: (mode) => set({ mode }),

  setPaused: (paused) => {
    const { current, positionSec } = get();
    // Пауза — надёжная точка сохранения: дальше пользователь может просто
    // убить приложение из недавних, и следующего тика прогресса не будет.
    if (paused && current) {
      flushProgress(current, positionSec);
    }
    set({ paused });
  },

  togglePlay: () => {
    const state = get();
    if (state.ended) {
      state.restart();
      return;
    }
    state.setPaused(!state.paused);
  },

  seekTo: (sec) => {
    const { durationSec } = get();
    const target = clamp(sec, 0, durationSec > 0 ? durationSec : sec);
    videoRef?.seek(target);
    set({ positionSec: target, ended: false });
  },

  seekBy: (delta) => get().seekTo(get().positionSec + delta),

  onLoaded: ({ durationSec, videoTracks, audioTracks, textTracks }) =>
    set((state) => ({
      durationSec: durationSec > 0 ? durationSec : state.durationSec,
      videoTracks,
      audioTracks,
      textTracks,
      buffering: false,
    })),

  onProgress: (positionSec, bufferedSec) => {
    const state = get();
    set({ positionSec, bufferedSec });

    if (state.current) {
      void useLibraryStore.getState().noteProgress(state.current, positionSec);
    }
    const timer = state.sleepTimer;
    if (timer.kind === 'at' && Date.now() >= timer.at) {
      set({ paused: true, sleepTimer: { kind: 'off' } });
    }
  },

  onEnded: () => {
    const state = get();
    if (state.current) {
      // Досматривание фиксируем по длительности, а не по позиции: у части
      // потоков последний тик прогресса не доезжает до самого конца.
      flushProgress(state.current, state.durationSec || state.positionSec);
    }
    if (state.repeat) {
      state.seekTo(0);
      return;
    }
    if (state.sleepTimer.kind === 'endOfVideo') {
      set({ paused: true, ended: true, sleepTimer: { kind: 'off' } });
      return;
    }
    const next = nextInQueue(state);
    const autoplay = useSettingsStore.getState().settings.autoplayNext;
    set({ paused: true, ended: true, pendingNext: autoplay ? next : null });
  },

  setBuffering: (buffering) => set({ buffering }),

  setRate: (rate) => set({ rate }),
  setMuted: (muted) => set({ muted }),
  setVolume: (volume) => set({ volume: clamp(volume, 0, 1), muted: volume <= 0 }),
  setDim: (dim) => set({ dim: clamp(dim, 0, 0.85) }),
  setResizeMode: (resizeMode) => set({ resizeMode }),
  toggleRepeat: () => set((state) => ({ repeat: !state.repeat })),
  setQuality: (quality) => set({ quality }),
  setAudioTrack: (audioTrack) => set({ audioTrack }),
  setTextTrack: (textTrack) => set({ textTrack }),
  setSleepTimer: (sleepTimer) => set({ sleepTimer }),
  setLocked: (locked) => set({ locked }),

  playNext: () => {
    const state = get();
    const next = nextInQueue(state);
    if (!next) {
      return;
    }
    // Режим сохраняем: если пользователь смотрел свёрнутым, следующее видео
    // не должно разворачиваться на весь экран у него под руками.
    const mode = state.mode;
    state.open(next, state.queue);
    set({ mode });
  },

  playPrevious: () => {
    const state = get();
    // Как в больших плеерах: в первые секунды «назад» — это предыдущий ролик,
    // дальше — начало текущего.
    if (state.positionSec > 5) {
      state.seekTo(0);
      return;
    }
    const previous = state.queue[state.queueIndex - 1];
    if (!previous) {
      state.seekTo(0);
      return;
    }
    const mode = state.mode;
    state.open(previous, state.queue);
    set({ mode });
  },

  cancelPendingNext: () => set({ pendingNext: null }),

  restart: () => {
    // Именно перемотка, а не обнуление `startPositionSec`: смена источника
    // заново открыла бы поток и дала лишнюю паузу на буферизацию.
    videoRef?.seek(0);
    set({ positionSec: 0, resumeFrom: null, ended: false, paused: false, pendingNext: null });
  },
}));

function nextInQueue(state: Pick<PlayerState, 'queue' | 'queueIndex'>): VideoSummary | null {
  return state.queue[state.queueIndex + 1] ?? null;
}

function flushProgress(video: VideoSummary, positionSec: number): void {
  void useLibraryStore.getState().noteProgress(video, positionSec, true);
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
