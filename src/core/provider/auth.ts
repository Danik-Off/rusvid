/**
 * Описание способа авторизации платформы.
 *
 * Это ДАННЫЕ, а не UI: экраны настроек и входа умеют отрисовать любой из
 * вариантов, ничего не зная про конкретную платформу. Добавили платформу —
 * вход появился сам.
 *
 * Общий принцип для всех вариантов: **пароль пользователя не проходит через
 * наш код**. Либо это OAuth платформы, либо её собственная форма входа,
 * открытая во встроенном браузере.
 */

export interface NoAuthSpec {
  readonly kind: 'none';
  /** Почему вход не нужен — показывается вместо кнопки. */
  readonly reason: string;
}

export interface OAuthSpec {
  readonly kind: 'oauth';
  /** Что пользователь получит, войдя. */
  readonly benefit: string;
  /**
   * Требуется ли ID приложения, созданного самим пользователем.
   * VK не выдаёт токены «анонимным» клиентам: у каждого приложения свой id,
   * и подставлять чужой — значит выступать от чужого имени.
   */
  readonly requiresClientId: boolean;
  readonly clientIdLabel: string;
  readonly clientIdPlaceholder: string;
  /** Инструкция «где взять» — открывается во внешнем браузере. */
  readonly helpUrl: string;
  /** Права, которые запрашиваются, — показываем до входа. */
  readonly scopeDescription: string;

  buildAuthorizeUrl(clientId: string): string;
  /**
   * Достать токен из URL, на который перешёл WebView.
   * `null` означает «это ещё промежуточный переход, ждём дальше».
   */
  extractToken(url: string): string | null;
  /** Ошибка авторизации в URL редиректа, если платформа её вернула. */
  extractError(url: string): string | null;
}

/**
 * Вход через собственную страницу платформы.
 *
 * У Rutube и Sasflix нет OAuth для сторонних клиентов, а форма входа живёт
 * в SPA (отдельного URL `/login` не существует). Поэтому открываем обычный
 * сайт во встроенном браузере: пользователь входит там так же, как в
 * мобильном браузере — по паролю, SMS или через соцсеть.
 *
 * Сессия сохраняется в системном хранилище cookie Android, которое
 * `WebView` и сетевой стек React Native делят между собой, поэтому
 * последующие запросы провайдера уходят уже авторизованными.
 * Проверка факта входа — вызовом `verifySessionPath`.
 */
export interface WebLoginSpec {
  readonly kind: 'webLogin';
  readonly benefit: string;
  /** Страница, с которой начинается вход. */
  readonly loginUrl: string;
  /** Что пользователю нажать на сайте — платформы прячут вход по-разному. */
  readonly instructions: string;
  /**
   * Путь, отвечающий 401/403 без сессии и 200 с ней.
   * По нему приложение понимает, что вход состоялся.
   */
  readonly verifySessionPath: string;
  /**
   * Origin'ы, на которых платформа держит cookie сессии.
   *
   * Это список, а не один адрес, потому что сессия одной платформы обычно
   * размазана по нескольким доменам (у VK — `vk.com` и `vkvideo.ru`).
   * Кнопка «Выйти» гасит cookie на всех перечисленных: пропущенный домен
   * восстановил бы вход автологином, и выход оказался бы фикцией.
   */
  readonly sessionOrigins: readonly string[];
  /** Страница выхода на сайте платформы (если есть). */
  readonly logoutUrl?: string;
}

export type ProviderAuthSpec = NoAuthSpec | OAuthSpec | WebLoginSpec;

/** Есть ли у платформы вход вообще. */
export function isAuthenticatable(
  spec: ProviderAuthSpec,
): spec is OAuthSpec | WebLoginSpec {
  return spec.kind !== 'none';
}

/** Разбор фрагмента вида `#access_token=…&expires_in=…`. */
export function parseUrlFragment(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  if (hashIndex < 0) {
    return {};
  }
  return parsePairs(url.slice(hashIndex + 1));
}

/** Разбор query-строки вида `?error=…&error_description=…`. */
export function parseUrlQuery(url: string): Record<string, string> {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) {
    return {};
  }
  const end = url.indexOf('#', queryIndex);
  return parsePairs(url.slice(queryIndex + 1, end < 0 ? undefined : end));
}

function parsePairs(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    if (pair.length === 0) {
      continue;
    }
    const separator = pair.indexOf('=');
    const key = separator < 0 ? pair : pair.slice(0, separator);
    const value = separator < 0 ? '' : pair.slice(separator + 1);
    result[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return result;
}
