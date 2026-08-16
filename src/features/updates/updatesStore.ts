import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import { APP_VERSION } from '../../app/version';
import { compareVersions, fetchLatestRelease, type ReleaseInfo } from './updateService';

/**
 * Как часто приложение само ходит за релизами.
 *
 * Раз в сутки, а не при каждом запуске: чаще бессмысленно (релизы выходят
 * реже), а лишние запросы к GitHub упираются в лимит для анонимных клиентов —
 * он общий на IP, и в мобильной сети за NAT его легко исчерпать чужими
 * запросами. Кнопка «Проверить» в настройках лимит игнорирует: там проверки
 * ждёт живой человек.
 */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const STATE_KEY = 'updates/v1';

type Status = 'idle' | 'checking' | 'upToDate' | 'available' | 'error';

interface PersistedState {
  readonly checkedAt: number;
  /** Версия, о которой пользователю уже сообщали, — чтобы не повторяться. */
  readonly dismissedVersion?: string;
}

interface UpdatesState {
  readonly status: Status;
  readonly latest: ReleaseInfo | null;
  readonly error: string | null;
  readonly checkedAt: number | null;
  readonly dismissedVersion: string | null;

  hydrate: () => Promise<void>;
  /** `force` — проверка по кнопке: игнорирует суточный интервал. */
  check: (force?: boolean) => Promise<void>;
  /** Скрыть отметку о найденной версии, не скрывая саму карточку. */
  dismiss: () => Promise<void>;
}

export const useUpdatesStore = create<UpdatesState>((set, get) => ({
  status: 'idle',
  latest: null,
  error: null,
  checkedAt: null,
  dismissedVersion: null,

  hydrate: async () => {
    const saved = await getAppContainer().store.read<PersistedState | null>(STATE_KEY, null);
    set({
      checkedAt: saved?.checkedAt ?? null,
      dismissedVersion: saved?.dismissedVersion ?? null,
    });
  },

  check: async (force = false) => {
    const { status, checkedAt } = get();
    if (status === 'checking') {
      return;
    }
    if (!force && checkedAt !== null && Date.now() - checkedAt < AUTO_CHECK_INTERVAL_MS) {
      return;
    }

    set({ status: 'checking', error: null });
    try {
      const release = await fetchLatestRelease();
      const now = Date.now();
      const newer = release !== null && compareVersions(release.version, APP_VERSION) > 0;

      set({
        latest: release,
        checkedAt: now,
        status: newer ? 'available' : 'upToDate',
      });
      await persist(get());
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Не удалось связаться с GitHub',
      });
    }
  },

  dismiss: async () => {
    const { latest } = get();
    if (!latest) {
      return;
    }
    set({ dismissedVersion: latest.version });
    await persist(get());
  },
}));

async function persist(state: UpdatesState): Promise<void> {
  await getAppContainer().store.write<PersistedState>(STATE_KEY, {
    checkedAt: state.checkedAt ?? Date.now(),
    dismissedVersion: state.dismissedVersion ?? undefined,
  });
}

/**
 * Стоит ли показывать метку «есть обновление».
 *
 * Отдельно от `status === 'available'`, потому что метка живёт по своим
 * правилам: пользователь мог уже увидеть эту версию и решить не ставить —
 * повторно дёргать его точкой на вкладке настроек не за что.
 */
export function useUpdateBadge(): boolean {
  const status = useUpdatesStore((state) => state.status);
  const latest = useUpdatesStore((state) => state.latest);
  const dismissed = useUpdatesStore((state) => state.dismissedVersion);
  return status === 'available' && latest !== null && latest.version !== dismissed;
}
