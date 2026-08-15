# Исследование API платформ

Все эндпоинты ниже проверены живыми запросами при разработке (август 2026).
Публичной документации нет ни у Rutube, ни у Sasflix — схемы выведены из
реальных ответов, поэтому в коде **все поля DTO необязательные**, а мапперы
обязаны пережить их отсутствие.

> Ничего из описанного не обходит платный доступ, DRM или блокировки.
> Там, где платформа не отдаёт поток (VK, DRM-контент Rutube, подписка Sasflix),
> приложение открывает официальный плеер или страницу на сайте.

---

## Rutube

Базовый URL: `https://rutube.ru`. Ключ не нужен, CORS/Referer не проверяется
на большинстве методов, но CDN подписанных ссылок требует `Referer`.

| Назначение | Метод | Заметки |
|---|---|---|
| Поиск | `GET /api/search/video/?query=<q>&page=<n>&per_page=<n>` | `{count, has_next, results[]}` |
| Лента категории | `GET /api/video/category/{id}/?page=<n>&ordering=-hits` | `{has_next, page, per_page, results[], num_pages}` |
| Список категорий | `GET /api/video/category/` | плоский **массив** (не объект), 42 записи |
| Детали видео | `GET /api/video/{id}/` | одиночный объект видео |
| Ссылка на поток | `GET /api/play/options/{id}/?no_404=true&referer=https://rutube.ru/&pver=v2` | см. ниже |
| Канал автора | `GET /api/video/person/{authorId}/?page=<n>` | тот же формат списка |

### `/api/play/options/{id}/`

Возвращает большой объект; нам нужны:

```jsonc
{
  "acl_access": { "allowed": true, "err_text": "" },
  "drm_token": null,                       // не null -> DRM, играем в embed
  "video_balancer": {
    "m3u8":    "https://bl.rutube.ru/route/<id>.m3u8?guids=…&sign=…&expire=…",
    "default": "https://bl.rutube.ru/route/<id>.m3u8?…"
  },
  "live_streams": {}                        // для эфиров тут hls
}
```

Ссылка **подписана и протухает** (`expire` — unix-время, порядка часов),
поэтому она запрашивается в момент открытия плеера и никогда не кэшируется
и не сохраняется в историю. CDN `bl.rutube.ru` требует заголовок
`Referer: https://rutube.ru/`.

### Чего у Rutube нет

`/api/feeds/popular/` возвращает **конфигурацию витрины** (вкладки, баннеры),
а не список видео; плоского эндпоинта «популярное» не существует.
Поэтому лента «Тренды» реализована как категория `57` («Развлечения»)
с `ordering=-hits` — константа `TRENDING_CATEGORY_ID` в `RutubeProvider`.
`/api/video/?page=1` отвечает `401`, `/api/tags/video/` — `404`.

### Прочее

- Даты (`created_ts`, `publication_ts`) приходят **без таймзоны** и означают
  московское время — маппер дописывает `+03:00` (`normalizeTimestamp`).
- Превью: `thumbnail_url` уже абсолютный (`pic.rtbcdn.ru`).
- Флаги доступа: `is_paid`, `is_club` → платное; `is_adult` → ограниченное;
  `is_hidden`, `is_deleted` → элемент выбрасывается.

---

## Sasflix

Базовый URL: `https://sasflix.ru`. Бэкенд — Laravel, фронт — Nuxt.
Ключ не нужен. Namespace API — `/api/web/…`, медиа — `/api/{image,poster,video}/…`.

| Назначение | Метод | Заметки |
|---|---|---|
| Лента | `GET /api/web/topics?page=<n>&limit=<n>` | `{total, rows[]}` |
| Лента категории | `GET /api/web/topics?category_id=<id>&page=&limit=` | **именно `category_id`** |
| Поиск | `GET /api/web/search?query=<q>&page=&limit=` | параметр `q` игнорируется |
| Категории | `GET /api/web/categories` | `{total, rows:[{id,title,uri,rank,hidden}]}` |
| Теги | `GET /api/web/tags` | 400+ записей |
| Детали | `GET /api/web/topics/{uuid}` | **по uuid, не по числовому id** |
| Настройки сайта | `GET /api/web/settings` | публичные переменные окружения |

### Единица контента — «топик»

```jsonc
{
  "id": 1111,
  "uuid": "95030b17-…",              // ключ для всех операций
  "title": "…",
  "type": "video",
  "views_count": 8314,
  "published_at": "2026-08-13T17:34:14.000000Z",
  "cover":  { "uuid": "67bc4642-…" },  // обложка
  "access": true,                       // false -> нужна подписка
  "paid":   false,
  "closed": false,
  "has_video": true,
  "video":  { "id": "43b191b3-…", "duration": 5910 }  // uuid медиафайла
}
```

### Медиа

| Что | URL |
|---|---|
| HLS-мастер | `GET /api/video/{video.id}` → `#EXTM3U` с рендишенами 240/480/720/1080/2160 |
| Постер из видео | `GET /api/poster/{video.id}?w=&h=&fit=crop` |
| Обложка топика | `GET /api/image/{cover.uuid}?w=&h=&fit=crop&fm=webp` |

Обратите внимание: манифест лежит **без расширения** — `/api/video/{uuid}`,
а не `/api/video/{uuid}/master.m3u8` (такой путь отвечает 404).
Content-Type — `audio/mpegurl`.

### Платный контент

`access: false`, `paid: true` или `closed: true` означают материал по подписке.
Такие карточки показываются с плашкой «ПЛАТНОЕ», а `resolvePlayback` бросает
`AUTH_REQUIRED` и предлагает открыть материал на сайте.

---

## VK Видео

Базовый URL: `https://api.vk.com/method`, версия API `5.199`.
**Требуется access token** с правом `video` — публичного поиска по видео нет.
Токен вводится пользователем в настройках приложения (см. `PROVIDERS.md`).

| Назначение | Метод |
|---|---|
| Поиск | `GET /video.search?q=&count=&offset=&sort=2&adult=0&access_token=&v=5.199` |
| Детали | `GET /video.get?videos=<owner_id>_<id>[_<access_key>]&access_token=&v=5.199` |

### Особенности

- **Ошибки приходят с HTTP 200** и телом `{"error":{"error_code":…,"error_msg":…}}`.
  Проверять статус-код недостаточно — этим занимается `VkApiClient`.
  Значимые коды: `5` (токен невалиден), `7`/`15` (нет прав), `6`/`29` (лимит),
  `18` (заблокировано).
- Идентификатор видео — тройка `owner_id_id_access_key`; именно в таком виде
  его принимает `video.get`, поэтому он хранится целиком.
- Пагинация — `offset`, а не номер страницы.
- `image[]` содержит превью разных размеров; варианты с `with_padding: 1`
  имеют поля-заглушки по бокам, поэтому предпочитаем без них.

### Воспроизведение

VK **не отдаёт прямые ссылки на файлы** сторонним приложениям: поле `files`
доступно только владельцу видео. Единственный корректный способ —
официальный плеер из поля `player` (`https://vk.com/video_ext.php?oid=…&id=…&hash=…`),
который открывается в `WebView`. Извлечение прямых ссылок в обход плеера
в проекте намеренно **не реализовано**.

### Чего нет

Публичной ленты/трендов у API нет: `video.getCatalog` доступен не всем токенам.
Поэтому `VkProvider.capabilities.trendingFeed === false`, и VK участвует
только в поиске.

---

## Как проверить эндпоинт вручную

```bash
curl -s "https://rutube.ru/api/search/video/?query=кот&page=1&per_page=2" | jq '.results[0] | keys'
curl -s "https://sasflix.ru/api/web/topics?page=1&limit=1" | jq '.rows[0]'
curl -s "https://api.vk.com/method/video.search?q=кот&count=2&access_token=$VK_TOKEN&v=5.199" | jq
```

Если платформа поменяла схему — правится **только маппер** соответствующего
провайдера; остальное приложение о её полях не знает.
