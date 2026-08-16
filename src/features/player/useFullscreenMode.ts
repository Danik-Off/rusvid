import { useCallback, useEffect, useRef } from 'react';

import { screenControl, type OrientationMode } from './screenControl';
import { usePlayerStore, type PlayerMode } from './playerStore';

/**
 * Сколько держать книжную ориентацию после выхода из полноэкранного режима.
 *
 * Если выйти, держа телефон боком, и сразу отпустить блокировку, окно
 * повернётся обратно в альбомную — и автоповорот немедленно вернул бы плеер
 * в полноэкранный режим. Пауза даёт руке время развернуть телефон.
 */
const PORTRAIT_HOLD_MS = 2500;

interface Params {
  readonly mode: PlayerMode;
  readonly setMode: (mode: PlayerMode) => void;
  readonly width: number;
  readonly height: number;
  /** Показан ли плеер вообще: при закрытии экран возвращается приложению. */
  readonly active: boolean;
}

export interface FullscreenControls {
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

/**
 * Полноэкранный режим: ориентация активности, системные полосы и автоповорот.
 *
 * Логика вынесена из `PlayerOverlay`, потому что это конечный автомат с
 * собственной памятью, а не просто «показать пошире»:
 *
 *  - вход  → блокируем альбомную ориентацию и прячем системные полосы;
 *  - выход → блокируем книжную на {@link PORTRAIT_HOLD_MS}, полосы возвращаем;
 *  - поворот телефона в альбомную сам разворачивает плеер, но только если
 *    пользователь не выходил из режима руками — иначе кнопка «выйти»
 *    не работала бы, пока телефон лежит боком.
 *
 * Если нативный модуль недоступен, блокировки становятся пустышками, а
 * поведение сводится к прежнему: кадр на весь экран, поворот — по системе.
 */
export function useFullscreenMode({ mode, setMode, width, height, active }: Params): FullscreenControls {
  const landscape = width > height;
  const lock = useRef<OrientationMode>('auto');
  /** Пользователь вышел руками — не втаскивать его обратно автоповоротом. */
  const suppressAutoEnter = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const enter = useCallback(() => {
    clearHold();
    suppressAutoEnter.current = false;
    lock.current = 'landscape';
    screenControl.setOrientation('landscape');
    screenControl.setImmersive(true);
    setMode('fullscreen');
  }, [setMode]);

  const exit = useCallback(() => {
    clearHold();
    // Блокировка живёт ровно столько, сколько полноэкранный режим: вынести
    // её в обычный плеер значило бы оставить пользователя с мёртвым экраном,
    // где даже описание не прокручивается.
    usePlayerStore.getState().setLocked(false);
    suppressAutoEnter.current = true;
    lock.current = 'portrait';
    screenControl.setImmersive(false);
    screenControl.setOrientation('portrait');
    setMode('full');
    holdTimer.current = setTimeout(() => {
      lock.current = 'auto';
      screenControl.setOrientation('auto');
    }, PORTRAIT_HOLD_MS);
  }, [setMode]);

  const toggle = useCallback(() => {
    if (mode === 'fullscreen') {
      exit();
    } else {
      enter();
    }
  }, [mode, enter, exit]);

  useEffect(() => {
    if (!active || lock.current !== 'auto') {
      return;
    }
    if (!landscape) {
      // Телефон снова вертикально: прошлый ручной выход перестаёт учитываться,
      // и следующий поворот опять развернёт плеер.
      suppressAutoEnter.current = false;
      if (mode === 'fullscreen') {
        setMode('full');
      }
      return;
    }
    if (mode === 'full' && !suppressAutoEnter.current) {
      enter();
    }
  }, [active, landscape, mode, setMode, enter]);

  // Плеер закрыли (или экран размонтировался) — экран возвращается приложению.
  useEffect(() => {
    if (active) {
      return;
    }
    clearHold();
    suppressAutoEnter.current = false;
    lock.current = 'auto';
    screenControl.setOrientation('auto');
    screenControl.setImmersive(false);
  }, [active]);

  useEffect(
    () => () => {
      clearHold();
      screenControl.setOrientation('auto');
      screenControl.setImmersive(false);
    },
    [],
  );

  return { enter, exit, toggle };
}
