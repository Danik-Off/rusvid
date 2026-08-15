/**
 * OAuth-вход VK (Implicit Flow) — тот же поток, что использует официальный
 * веб-клиент: страница согласия открывается во встроенном браузере, а токен
 * приходит во фрагменте URL редиректа на `blank.html`.
 *
 * Почему нужен клиентский `client_id` пользователя: VK выдаёт токены только
 * зарегистрированным приложениям. Подставить чужой app id технически можно,
 * но это значит выступать от чужого имени и нарушать условия платформы,
 * поэтому пользователь один раз создаёт своё приложение (ссылка в подсказке)
 * и вводит его ID.
 *
 * Пароль VK в приложение НЕ вводится и не проходит через наш код: его
 * принимает страница VK внутри WebView.
 */

import type { OAuthSpec } from '../../core/provider/auth';
import { parseUrlFragment, parseUrlQuery } from '../../core/provider/auth';
import { VK_API_VERSION } from './VkApiClient';

export const VK_REDIRECT_URL = 'https://oauth.vk.com/blank.html';

/**
 * `video`   — чтение видео (поиск, детали, ссылка на плеер);
 * `offline` — бессрочный токен, иначе он протухает через сутки и вход
 *             пришлось бы повторять каждый день.
 */
const VK_SCOPE = 'video,offline';

export const vkAuthSpec: OAuthSpec = {
  kind: 'oauth',
  benefit: 'Поиск по видео VK и воспроизведение в официальном плеере',
  requiresClientId: true,
  clientIdLabel: 'ID приложения VK',
  clientIdPlaceholder: 'например, 51234567',
  helpUrl: 'https://dev.vk.com/ru/admin/apps-list',
  scopeDescription: 'Доступ только к видео (scope: video, offline). Пароль вводится на сайте VK.',

  buildAuthorizeUrl(clientId: string): string {
    const params = [
      `client_id=${encodeURIComponent(clientId)}`,
      `redirect_uri=${encodeURIComponent(VK_REDIRECT_URL)}`,
      `scope=${encodeURIComponent(VK_SCOPE)}`,
      'display=mobile',
      'response_type=token',
      `v=${VK_API_VERSION}`,
      // Каждый вход заново показывает экран согласия — иначе после «Выйти»
      // VK молча вернул бы старый токен той же сессии.
      'revoke=1',
    ];
    return `https://oauth.vk.com/authorize?${params.join('&')}`;
  },

  extractToken(url: string): string | null {
    if (!url.startsWith(VK_REDIRECT_URL)) {
      return null;
    }
    const token = parseUrlFragment(url).access_token;
    return token && token.length > 0 ? token : null;
  },

  extractError(url: string): string | null {
    if (!url.startsWith(VK_REDIRECT_URL)) {
      return null;
    }
    const fragment = parseUrlFragment(url);
    const query = parseUrlQuery(url);
    const error = fragment.error ?? query.error;
    if (!error) {
      return null;
    }
    const description = fragment.error_description ?? query.error_description;
    return description ? `${error}: ${description}` : error;
  },
};
