/**
 * Хранилище учётных данных платформ (токен + id приложения пользователя).
 *
 * Провайдерам нужен СИНХРОННЫЙ ответ на вопрос «я сконфигурирован?»
 * (`VideoProvider.isConfigured()` вызывается на каждый рендер списка платформ),
 * поэтому значения держатся в памяти и один раз гидрируются с диска при старте.
 *
 * Безопасность: AsyncStorage — не защищённое хранилище. Данные лежат в
 * приватном каталоге приложения (недоступны другим приложениям на не-root
 * устройстве), но не шифруются. Это осознанный компромисс: чтобы перейти на
 * Android Keystore, достаточно подменить реализацию `KeyValueStore`.
 */

import type { ProviderId } from '../../core/model/media';
import type { KeyValueStore } from '../storage/KeyValueStore';

const CREDENTIALS_KEY = 'credentials/v2';

export interface ProviderCredentials {
  /** Access token платформы. */
  readonly token?: string;
  /** ID приложения, созданного пользователем (нужен для OAuth у VK). */
  readonly clientId?: string;
  /** Когда токен получен — показываем в настройках. */
  readonly obtainedAt?: number;
  /**
   * Когда подтверждена cookie-сессия сайта (вариант `webLogin`).
   *
   * Сама сессия живёт в системном хранилище cookie Android, а не здесь:
   * тут только отметка «вход был», чтобы UI не дёргал сеть на каждый рендер.
   * Источник истины — `verifySession()` провайдера.
   */
  readonly signedInAt?: number;
}

type CredentialsMap = Partial<Record<ProviderId, ProviderCredentials>>;

export class CredentialsStore {
  private cache: CredentialsMap = {};
  private hydrated = false;

  constructor(private readonly store: KeyValueStore) {}

  async hydrate(): Promise<void> {
    this.cache = await this.store.read<CredentialsMap>(CREDENTIALS_KEY, {});
    this.hydrated = true;
  }

  get isHydrated(): boolean {
    return this.hydrated;
  }

  get(providerId: ProviderId): ProviderCredentials {
    return this.cache[providerId] ?? {};
  }

  getToken(providerId: ProviderId): string | null {
    const token = this.cache[providerId]?.token;
    return token && token.length > 0 ? token : null;
  }

  getClientId(providerId: ProviderId): string | null {
    const clientId = this.cache[providerId]?.clientId;
    return clientId && clientId.length > 0 ? clientId : null;
  }

  async setToken(providerId: ProviderId, token: string | null, now = Date.now()): Promise<void> {
    const trimmed = token?.trim();
    await this.patch(providerId, (current) =>
      trimmed
        ? { ...current, token: trimmed, obtainedAt: now }
        : { ...current, token: undefined, obtainedAt: undefined },
    );
  }

  async setClientId(providerId: ProviderId, clientId: string | null): Promise<void> {
    const trimmed = clientId?.trim();
    await this.patch(providerId, (current) => ({
      ...current,
      clientId: trimmed && trimmed.length > 0 ? trimmed : undefined,
    }));
  }

  /** Подтверждена ли cookie-сессия сайта. */
  hasSession(providerId: ProviderId): boolean {
    return this.cache[providerId]?.signedInAt !== undefined;
  }

  async setSession(providerId: ProviderId, active: boolean, now = Date.now()): Promise<void> {
    // Ничего не пишем, если состояние не изменилось: verifySession вызывается
    // при каждом открытии настроек, и лишние записи на диск не нужны.
    if (this.hasSession(providerId) === active) {
      return;
    }
    await this.patch(providerId, (current) => ({
      ...current,
      signedInAt: active ? now : undefined,
    }));
  }

  /** Полный выход: убираем токен и отметку о сессии, но сохраняем id приложения. */
  async signOut(providerId: ProviderId): Promise<void> {
    await this.patch(providerId, (current) => ({
      ...current,
      token: undefined,
      obtainedAt: undefined,
      signedInAt: undefined,
    }));
  }

  private async patch(
    providerId: ProviderId,
    update: (current: ProviderCredentials) => ProviderCredentials,
  ): Promise<void> {
    const next: CredentialsMap = { ...this.cache };
    const updated = update(next[providerId] ?? {});
    // Пустую запись не храним — иначе на диске копится мусор из ключей.
    if (!updated.token && !updated.clientId && updated.signedInAt === undefined) {
      delete next[providerId];
    } else {
      next[providerId] = updated;
    }
    this.cache = next;
    await this.store.write(CREDENTIALS_KEY, next);
  }
}
