# Исследование API платформ

Все эндпоинты ниже проверены живыми запросами при разработке (август 2026).
Публичной документации нет ни у Rutube, ни у Sasflix — схемы выведены из
реальных ответов, поэтому в коде **все поля DTO необязательные**, а мапперы
обязаны пережить их отсутствие.

> Ничего из описанного не обходит платный доступ, DRM или блокировки.
> Там, где приложение не играет поток само (VK, DRM-контент Rutube, подписка
> Sasflix), оно открывает официальный плеер или страницу на сайте.

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

## <a id="vk-видео"></a>VK Видео

Базовый URL: `https://api.vkvideo.ru/method`, версия API `5.259`. Это шлюз,
которым пользуется сам сайт `vkvideo.ru`. Все методы вызываются POST-ом формой,
`access_token` обязателен — но получить его можно **и без всякого входа**.

### Токен доступа

| Режим | Метод | Обязательные параметры | Ответ |
|---|---|---|---|
| Анонимный | `POST /method/auth.getAnonymToken` | `client_id=52461373` | `{response:{token:"anonym.…", expired_at}}` |
| Пользовательский | `POST /method/video.getWebToken` | `app_id=52461373` + cookie сайта | `{response:{token, expired_at}}` |

`client_id` / `app_id` `52461373` — публичный номер веб-клиента VK Видео.
Секрет **не нужен**: `auth.getAnonymToken` отвечает и без него, и без cookie.
Токен живёт сутки (`expired_at` — unix-время).

Тот же `auth.getAnonymToken` работает и на `api.vk.com`, и на `login.vk.ru`
(`?act=get_anonym_token`, ответ в форме `{type:"okay",data:{access_token,…}}`) —
запасные площадки, если основная станет недоступна.

### Методы

| Назначение | Метод | Заметки |
|---|---|---|
| Поиск | `catalog.getVideoSearch?q=<q>` | **не** `video.search` — её на шлюзе нет |
| Разделы витрины | `catalog.getVideo` | только список секций, карточек внутри нет |
| Страница раздела | `catalog.getSection?section_id=<id>&start_from=<next_from>` | и лента, и продолжение поиска |
| Детали видео | `video.get?videos=<owner_id>_<id>[_<access_key>]` | принимает список через запятую |

`count` и `offset` **игнорируются**: пагинация только через `next_from`.

Проверить вручную:

```bash
TOKEN=$(curl -s -X POST https://api.vkvideo.ru/method/auth.getAnonymToken \
  -d 'client_id=52461373&v=5.259' | jq -r .response.token)
curl -s -G https://api.vkvideo.ru/method/catalog.getVideoSearch \
  --data-urlencode 'q=кот' --data "v=5.259&lang=ru&access_token=$TOKEN" | jq '.response|keys'
```

### Формат каталога

Ответ — не список, а конструктор интерфейса:

```jsonc
{
  "catalog": { "sections": [{
    "id": "PUldVA8HWkpk…",              // нужен для следующей страницы
    "next_from": "PUkaE1RGCA4ZChoP…",   // позиция; нет -> список кончился
    "blocks": [
      { "data_type": "search_filter" },              // мусор для нас
      { "data_type": "videos", "videos_ids": ["-99085029_456241689", …] },
      { "data_type": "catalog_videos", "videos_ids": […] }
    ]
  }]},
  "videos":         [ { "owner_id": -99085029, "id": 456241689, … } ],
  "catalog_videos": [ { "video": { … } } ],           // те же объекты, другая обёртка
  "groups":         [ { "id": 99085029, "name": "…", "photo_200": "…" } ],
  "profiles":       [ { "id": 5, "first_name": "…", … } ]
}
```

Отсюда три следствия, зашитые в `vkCatalog.ts`:

- объекты видео лежат **в двух местах сразу** и дублируются между блоками —
  собираем и то и другое, схлопывая по `owner_id_id`;
- раскладка блоков плавающая (в одном ответе полоса, в другом сетка), поэтому
  порядок берётся из блоков, но карточки, не попавшие ни в один блок,
  дописываются следом — иначе смена вёрстки даёт пустой экран;
- автор в самом видео **не приходит** — только `owner_id`, по которому он
  ищется в `groups`/`profiles`. У сообществ `owner_id` отрицательный,
  а `groups[].id` — нет.

`catalog.getVideo` возвращает секции **с пустыми блоками**: это список
категорий, за карточками надо идти в `catalog.getSection`.

### Особенности

- **Ошибки приходят с HTTP 200** и телом `{"error":{"error_code":…,"error_msg":…}}`.
  Проверять статус-код недостаточно — этим занимается `vkEnvelope.ts`.
  Значимые коды: `5` (нет пользовательской авторизации), `28` («метод
  недоступен с анонимным токеном» — тоже «нужен вход»), `6`/`29` (лимит),
  `15`/`18`/`204` (доступ закрыт), `3` (метода не существует).
- Код `28` против `3` — удобный оракул при разведке: первый значит «метод есть,
  но нужен вход», второй — «такого метода нет».
- Идентификатор видео — тройка `owner_id_id_access_key`; именно в таком виде
  его принимает `video.get`, поэтому он хранится целиком.
- `image[]` содержит превью разных размеров; варианты с `with_padding: 1`
  имеют поля-заглушки по бокам, поэтому предпочитаем без них. У свежих
  загрузок и эфиров обложки может не быть — тогда берём `first_frame[]`.
- Ответы шлюза — `application/json; charset=utf-8`. Возни с `windows-1251`,
  которой требовал старый `al_video.php`, здесь нет.

### Что открывает вход

Анонимному токену доступны поиск, витрина, разделы и `video.get`.
Вход даёт персональную выдачу в тех же методах и открывает `video.getCatalog`
(персональная витрина) и `groups.get` — они отвечают `error_code: 28`/`15`
анонимному клиенту. Отдельной ленты подписок у платформы нет вовсе:
`video.getSubscriptions`, `video.getFeed`, `video.getHistory` отвечают
`error_code: 3` — таких методов не существует.

### Воспроизведение

Играем в официальном плеере: `https://vk.com/video_ext.php?oid=…&id=…&hash=…`
внутри `WebView`. Домен важен — `vkvideo.ru/video_ext.php` уводит анонимного
гостя на автологин (302), `vk.com` отдаёт плеер сразу (200).

`hash` берётся из поля `player` карточки; без него часть видео не открывается,
а вывести его из идентификатора нельзя. Зависимости от карточки при этом нет:
не ответила — играем по идентификатору.

> Поля `files.hls` / `files.mp4_*` в ответах присутствуют (ссылки подписаны и
> привязаны к IP запрашивающего), но приложение их **намеренно не использует** —
> видео играется в плеере платформы.

### Чего больше не используем

Внутренние endpoint'ы старого веб-клиента (`vk.com/al_video.php`). Анонимному
клиенту они отвечают отказом `{"payload":["3",…],"statsMeta":{"id":0}}` при
любых заголовках и cookie, а на `vkvideo.ru` их нет вовсе (404).
Публичный `api.vk.com/method/video.search` требует токен приложения,
зарегистрированного пользователем, — этот барьер и был причиной переезда.

---

## Как проверить эндпоинт вручную

```bash
curl -s "https://rutube.ru/api/search/video/?query=кот&page=1&per_page=2" | jq '.results[0] | keys'
curl -s "https://sasflix.ru/api/web/topics?page=1&limit=1" | jq '.rows[0]'

# VK: токен — одной строкой и без входа, дальше любой метод из таблицы выше
VK=$(curl -s -X POST https://api.vkvideo.ru/method/auth.getAnonymToken \
  -d 'client_id=52461373&v=5.259' | jq -r .response.token)
curl -s -G https://api.vkvideo.ru/method/catalog.getVideoSearch \
  --data-urlencode 'q=кот' --data "v=5.259&lang=ru&access_token=$VK" | jq '.response.videos[0]|keys'
```

Или разом всё живое, включая VK без входа:
`$env:RUSVID_LIVE='1'; npm test -- live.smoke`.

Если платформа поменяла схему — правится **только маппер** соответствующего
провайдера; остальное приложение о её полях не знает.
