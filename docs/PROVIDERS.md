# Как добавить платформу

Добавление новой видеоплатформы **не требует правок в экранах, навигации или
сторах**. Нужно создать один каталог и дописать одну строку в реестр.

## Чек-лист

### 1. Зарегистрировать идентификатор

`src/core/model/media.ts`:

```ts
export const PROVIDER_IDS = ['rutube', 'vk', 'sasflix', 'newtube'] as const;
```

TypeScript сразу подсветит все места, где нужно учесть новую платформу
(их немного — это и есть смысл закрытого union).

### 2. Создать каталог `src/providers/newtube/`

| Файл | Назначение |
|---|---|
| `newtubeApiTypes.ts` | DTO ответов платформы. **Все поля необязательные** — API меняется без предупреждения |
| `newtubeMappers.ts` | чистые функции DTO → доменная модель. Без сети, без состояния — их легко тестировать |
| `NewtubeProvider.ts` | реализация `VideoProvider`: HTTP-вызовы + вызов мапперов |

### 3. Реализовать `VideoProvider`

```ts
export class NewtubeProvider implements VideoProvider {
  readonly meta: ProviderMeta = {
    id: 'newtube',
    title: 'NewTube',
    badge: 'NT',                 // 2–3 символа для плашки на превью
    accentColor: '#7C5CFF',
    homepage: 'https://newtube.example',
    description: 'Текст под переключателем в настройках',
  };

  readonly capabilities: ProviderCapabilities = {
    search: true,
    trendingFeed: true,
    categories: false,
    nativePlayback: true,
    embedPlayback: false,
    requiresCredentials: false,
  };

  private readonly http = new HttpClient({
    baseUrl: 'https://newtube.example',
    providerId: 'newtube',
  });

  isConfigured(): boolean {
    return true;                 // или проверка токена в CredentialsStore
  }

  async search(request, context) { /* … */ }
  async feed(request, context) { /* … */ }
  async getDetails(id, context) { /* … */ }
  async resolvePlayback(request, context) { /* … */ }
}
```

### 4. Зарегистрировать

`src/providers/registerProviders.ts`:

```ts
return new ProviderRegistry()
  .register(new RutubeProvider())
  .register(new VkProvider(credentials))
  .register(new SasflixProvider())
  .register(new NewtubeProvider());   // ← одна строка
```

Платформа появится в ленте, поиске и настройках автоматически.

### 5. Написать тесты мапперов

Скопируйте **реальный** ответ API в фикстуру и проверьте маппинг:
`src/providers/newtube/__tests__/newtubeMappers.test.ts`.
Смотрите существующие тесты как образец — они проверяют не только happy path,
но и элементы без id, платный контент, прямые эфиры.

---

## Правила, которые стоит соблюдать

**Не ходите в `fetch` напрямую.** Используйте `HttpClient` — он даёт единые
таймауты, ретраи с экспоненциальной задержкой и нормализацию ошибок.

**Не бросайте наружу чужие ошибки.** Только `ProviderError` с подходящим
кодом. `HttpClient` делает это за вас; свои проверки оформляйте так же:

```ts
throw new ProviderError({
  code: 'AUTH_REQUIRED',
  providerId: 'newtube',
  message: 'Добавьте токен NewTube в настройках',
});
```

**Не врите в `capabilities`.** Если платформа не умеет ленту — поставьте
`trendingFeed: false`, и агрегатор её просто не спросит. Объявить `true` и
бросать `UNSUPPORTED` — значит показывать пользователю ложную ошибку.

**Не кэшируйте подписанные ссылки.** `resolvePlayback` вызывается каждый раз
при открытии плеера именно поэтому. В `TtlCache` кладите только долгоживущее:
категории, детали карточек.

**Курсор непрозрачен.** Кодируйте в строку что угодно (номер страницы, offset,
токен) — агрегатор в него не заглядывает. `null` = страницы кончились.

**Уважайте платный контент и DRM.** Если материал за подпиской или защищён
DRM — верните `embed`/бросьте `AUTH_REQUIRED`. Обход платного доступа в этот
проект не принимается.

---

## Авторизация

Способ входа — это **данные**, а не код экрана. Провайдер объявляет
`auth: ProviderAuthSpec`, а `SettingsScreen` и `AuthScreen` отрисуют его,
ничего не зная про конкретную платформу. Вариантов три.

Общее правило: **пароль пользователя не проходит через наш код** ни в одном
из вариантов.

### `kind: 'none'` — вход не нужен

```ts
readonly auth: ProviderAuthSpec = {
  kind: 'none',
  reason: 'Публичное API: поиск, лента и воспроизведение работают без входа.',
};
```

### `kind: 'oauth'` — редирект с токеном

Для платформ с OAuth для сторонних клиентов. См. `src/providers/vk/vkAuth.ts`.

```ts
readonly auth = {
  kind: 'oauth',
  benefit: 'Что даст вход',
  requiresClientId: true,            // нужен app id пользователя
  clientIdLabel: 'ID приложения',
  clientIdPlaceholder: '51234567',
  helpUrl: 'https://…',
  scopeDescription: 'Какие права запрашиваем',
  buildAuthorizeUrl: (clientId) => `https://…?client_id=${clientId}&…`,
  extractToken: (url) => /* токен из редиректа или null */,
  extractError: (url) => /* текст ошибки или null */,
} satisfies OAuthSpec;
```

### `kind: 'webLogin'` — вход на сайте платформы

Для платформ **без** OAuth, у которых форма входа живёт внутри SPA
(отдельного `/login` не существует) — это Rutube и Sasflix.

```ts
readonly auth: ProviderAuthSpec = {
  kind: 'webLogin',
  benefit: 'Лента подписок и доступ к вашим приватным видео',
  loginUrl: 'https://rutube.ru/',
  instructions: 'Нажмите «Войти» в шапке сайта…',
  verifySessionPath: '/api/profile/user/',   // 401 без сессии, 200 с ней
  logoutUrl: 'https://rutube.ru/logout/',
};
```

Как это работает: приложение открывает обычный сайт платформы во встроенном
браузере, пользователь входит там как в мобильном браузере. На Android
`WebView` и сетевой стек React Native делят системное хранилище cookie,
поэтому после входа обычные запросы провайдера уходят уже авторизованными.

Момент входа определить по URL нельзя (редиректа нет), поэтому факт сессии
проверяется живым запросом на `verifySessionPath` — автоматически после
каждой навигации и по кнопке «Я вошёл». Логика вынесена в
`src/providers/shared/WebSessionGuard.ts`, провайдеру достаточно
делегировать ему `isSignedIn()` и `verifySession()`.

`WebSessionGuard` намеренно **не сбрасывает** вход, если проверка упала по
сети или 5xx: пропавший интернет — это не «пользователь вышел».

---

## Вход по платформам

### <a id="vk-token"></a>VK — OAuth

VK требует авторизации для базовой работы: публичного поиска по видео в API
нет, поэтому без входа `VkProvider.isConfigured()` возвращает `false` и
агрегатор молча исключает VK из опроса.

**Настройки → VK Видео → Войти.** Приложение открывает страницу согласия VK
и ловит токен из редиректа на `oauth.vk.com/blank.html#access_token=…`.

Один раз потребуется **ID вашего приложения VK**: платформа выдаёт токены
только зарегистрированным клиентам. Создайте приложение типа Standalone в
[списке приложений](https://dev.vk.com/ru/admin/apps-list) и вставьте его ID.

> Подставлять чужой app id (например, официального клиента) в проекте
> сознательно не сделано: это значит выступать от чужого имени.

Запрашиваются права `video` и `offline` (бессрочный токен — иначе вход
пришлось бы повторять каждые сутки). В URL добавлен `revoke=1`, чтобы после
«Выйти» следующий вход снова показывал экран согласия.

Если токен протух, VK вернёт код `5` — пользователь увидит полосу
«VK Видео: токен VK недействителен или истёк», а результаты остальных
платформ останутся на экране. Запасной путь — вставить готовый access token
вручную на том же экране.

### Rutube — вход на сайте

Работает и анонимно; вход открывает **ленту подписок**
(`GET /api/subscription/video/?page=`, без сессии отвечает 401).

Проверка сессии — `GET /api/profile/user/`: 401 без входа, 200 с ним.
OAuth для сторонних клиентов Rutube не даёт, а `/login/` отвечает 404 —
форма входа целиком внутри SPA.

### Sasflix — вход на сайте

Работает и анонимно; вход открывает **материалы по вашей подписке**.

Проверка сессии — `GET /api/user/profile`: без входа отвечает
`401 "Authentication required"`.

У Sasflix есть и прямой `POST /api/security/login` с `{email, password}`
(на неверные данные отвечает `422 "errors.login.wrong"`), но он потребовал бы
ввода пароля в наше поле — поэтому используется форма на сайте.

Важная деталь маппинга: поле `access` в ответах API **зависит от сессии** —
у вошедшего подписчика платный материал приходит с `access: true`. Поэтому
плашка «ПОДПИСКА» вешается по `access === false`, а не по `paid`, и кэш
топиков сбрасывается при смене состояния входа.
