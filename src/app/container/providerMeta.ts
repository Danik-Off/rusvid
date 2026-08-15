import type { ProviderId } from '../../core/model/media';
import type { ProviderMeta } from '../../core/provider/VideoProvider';
import { colors } from '../../ui/theme';
import { getAppContainer } from './AppContainer';

/**
 * Метаданные платформы для UI.
 *
 * Возвращает заглушку, если провайдера больше нет в сборке: в истории и
 * избранном могут лежать карточки, сохранённые предыдущей версией приложения,
 * и они не должны ронять список.
 */
export function getProviderMeta(providerId: ProviderId): ProviderMeta {
  const registry = getAppContainer().registry;
  if (!registry.has(providerId)) {
    return {
      id: providerId,
      title: providerId,
      badge: providerId.slice(0, 2).toUpperCase(),
      accentColor: colors.textMuted,
      homepage: '',
      description: 'Платформа больше не поддерживается этой версией приложения',
    };
  }
  return registry.get(providerId).meta;
}
