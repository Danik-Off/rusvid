/**
 * Реестр провайдеров — единственная точка, где приложение узнаёт,
 * какие платформы вообще существуют.
 */

import { ProviderError } from '../errors/ProviderError';
import type { ProviderId } from '../model/media';
import type { VideoProvider } from './VideoProvider';

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, VideoProvider>();

  register(provider: VideoProvider): this {
    if (this.providers.has(provider.meta.id)) {
      throw new Error(`Провайдер "${provider.meta.id}" уже зарегистрирован`);
    }
    this.providers.set(provider.meta.id, provider);
    return this;
  }

  /** Все зарегистрированные, в порядке регистрации. */
  all(): readonly VideoProvider[] {
    return Array.from(this.providers.values());
  }

  get(id: ProviderId): VideoProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError({
        code: 'UNSUPPORTED',
        providerId: id,
        message: `Провайдер "${id}" не зарегистрирован`,
      });
    }
    return provider;
  }

  has(id: ProviderId): boolean {
    return this.providers.has(id);
  }

  /**
   * Провайдеры, которые надо реально опрашивать: включены пользователем
   * (`enabledIds`) и сконфигурированы (есть токен, если он нужен).
   */
  active(enabledIds: readonly ProviderId[]): readonly VideoProvider[] {
    const enabled = new Set(enabledIds);
    return this.all().filter(
      (provider) => enabled.has(provider.meta.id) && provider.isConfigured(),
    );
  }
}
