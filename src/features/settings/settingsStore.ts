import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import type { ProviderId } from '../../core/model/media';
import { DEFAULT_SETTINGS, type AppSettings } from '../../data/settings/AppSettings';
import { webSession } from '../../providers/shared/webSession';

interface SettingsState {
  readonly settings: AppSettings;
  /** Вошёл ли пользователь в каждую платформу — зеркало для рендера. */
  readonly signedIn: Partial<Record<ProviderId, boolean>>;
  /** ID приложения пользователя (OAuth), чтобы не вводить его каждый раз. */
  readonly clientIds: Partial<Record<ProviderId, string>>;
  readonly hydrated: boolean;

  hydrate: () => Promise<void>;
  toggleProvider: (id: ProviderId) => Promise<void>;
  /**
   * Точечное изменение настроек.
   *
   * Настроек плеера стало больше десятка, и отдельный сеттер на каждую
   * превратился бы в стену однострочников: экран настроек всё равно всегда
   * знает и поле, и новое значение.
   */
  update: (patch: Partial<AppSettings>) => Promise<void>;
  setToken: (id: ProviderId, token: string | null) => Promise<void>;
  setClientId: (id: ProviderId, clientId: string | null) => Promise<void>;
  signOut: (id: ProviderId) => Promise<void>;
  /** Живая проверка сессии одной платформы (после входа в WebView). */
  verifySession: (id: ProviderId) => Promise<boolean>;
  /** Проверить все платформы со входом — при старте и открытии настроек. */
  verifyAllSessions: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  signedIn: {},
  clientIds: {},
  hydrated: false,

  hydrate: async () => {
    const { settings, credentials } = getAppContainer();
    await credentials.hydrate();
    const loaded = await settings.load();
    set({
      settings: loaded,
      signedIn: snapshotSignedIn(),
      clientIds: snapshotClientIds(),
      hydrated: true,
    });
  },

  toggleProvider: async (id) => {
    const current = get().settings;
    const enabled = new Set(current.enabledProviders);
    if (enabled.has(id)) {
      enabled.delete(id);
    } else {
      enabled.add(id);
    }
    // Полное отключение всех платформ сделало бы приложение бесполезным.
    if (enabled.size === 0) {
      return;
    }
    await persist(set, { ...current, enabledProviders: Array.from(enabled) });
  },

  update: async (patch) => {
    await persist(set, { ...get().settings, ...patch });
  },

  setToken: async (id, token) => {
    await getAppContainer().credentials.setToken(id, token);
    set({ signedIn: snapshotSignedIn() });
  },

  setClientId: async (id, clientId) => {
    await getAppContainer().credentials.setClientId(id, clientId);
    set({ clientIds: snapshotClientIds() });
  },

  /**
   * Выход из платформы.
   *
   * Порядок важен: сначала гасим cookie сайта, потом забываем свою отметку.
   * Раньше здесь было только второе — и выход не работал: cookie оставались,
   * а ближайшая `verifyAllSessions()` (она идёт при каждом открытии настроек)
   * находила живую сессию и возвращала «Вход выполнен». Пользователь при этом
   * был уверен, что вышел.
   *
   * Если очистка не удалась, отметку НЕ трогаем: показать «вы вышли», оставив
   * сессию на месте, — худший из возможных исходов.
   */
  signOut: async (id) => {
    const { auth } = getAppContainer().registry.get(id);
    if (auth.kind === 'webLogin') {
      await webSession.clearCookies(auth.sessionOrigins);
    }
    await getAppContainer().credentials.signOut(id);
    set({ signedIn: snapshotSignedIn() });
  },

  verifySession: async (id) => {
    const provider = getAppContainer().registry.get(id);
    if (!provider.verifySession) {
      return provider.isSignedIn();
    }
    const active = await provider.verifySession({});
    set({ signedIn: snapshotSignedIn() });
    return active;
  },

  verifyAllSessions: async () => {
    const providers = getAppContainer()
      .registry.all()
      .filter((provider) => provider.verifySession !== undefined);

    // Проверки независимы: одна упавшая платформа не должна мешать остальным.
    await Promise.allSettled(providers.map((provider) => provider.verifySession?.({})));
    set({ signedIn: snapshotSignedIn() });
  },
}));

async function persist(
  set: (partial: Partial<SettingsState>) => void,
  next: AppSettings,
): Promise<void> {
  set({ settings: next });
  await getAppContainer().settings.save(next);
}

function snapshotSignedIn(): Partial<Record<ProviderId, boolean>> {
  const snapshot: Partial<Record<ProviderId, boolean>> = {};
  for (const provider of getAppContainer().registry.all()) {
    snapshot[provider.meta.id] = provider.isSignedIn();
  }
  return snapshot;
}

function snapshotClientIds(): Partial<Record<ProviderId, string>> {
  const { registry, credentials } = getAppContainer();
  const snapshot: Partial<Record<ProviderId, string>> = {};
  for (const provider of registry.all()) {
    const clientId = credentials.getClientId(provider.meta.id);
    if (clientId) {
      snapshot[provider.meta.id] = clientId;
    }
  }
  return snapshot;
}
