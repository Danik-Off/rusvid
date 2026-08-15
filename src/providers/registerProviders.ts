/**
 * ЕДИНСТВЕННОЕ место, где приложение знает список платформ.
 *
 * Чтобы добавить платформу: реализуйте `VideoProvider` в `src/providers/<id>/`,
 * добавьте её id в `PROVIDER_IDS` (src/core/model/media.ts) и допишите одну
 * строку ниже. Подробный чек-лист — docs/PROVIDERS.md.
 */

import { ProviderRegistry } from '../core/provider/ProviderRegistry';
import type { CredentialsStore } from '../data/credentials/CredentialsStore';
import { RutubeProvider } from './rutube/RutubeProvider';
import { SasflixProvider } from './sasflix/SasflixProvider';
import { VkProvider } from './vk/VkProvider';

export function registerProviders(credentials: CredentialsStore): ProviderRegistry {
  return new ProviderRegistry()
    .register(new RutubeProvider(credentials))
    .register(new VkProvider(credentials))
    .register(new SasflixProvider(credentials));
}
