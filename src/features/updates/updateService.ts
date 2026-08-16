/**
 * Проверка обновлений по релизам GitHub.
 *
 * Приложение раздаётся APK-файлами из GitHub Releases, а не через магазин,
 * поэтому «обновиться» пользователь может только одним способом: узнать, что
 * вышла новая версия, и скачать её руками. До этого узнать было неоткуда —
 * в настройках не показывалась даже текущая версия.
 *
 * Релизы выпускает CI (`.github/workflows/release.yml`) на каждый значимый
 * push в main: он поднимает версию в package.json, ставит тег `vX.Y.Z` и
 * прикладывает APK. Здесь мы читаем ровно эту цепочку с другого конца.
 *
 * Чего здесь СОЗНАТЕЛЬНО нет — самостоятельной установки APK. Для неё нужны
 * разрешение `REQUEST_INSTALL_PACKAGES` и FileProvider, то есть приложение
 * получило бы право ставить на устройство произвольные пакеты. Для
 * агрегатора видео это несоразмерная плата, поэтому мы открываем страницу
 * релиза в браузере, а установку пользователь подтверждает системе сам.
 */

const REPOSITORY = 'Danik-Off/rusvid';

export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;

const LATEST_RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

/** Дольше ждать проверку обновлений незачем — она фоновая и необязательная. */
const TIMEOUT_MS = 10_000;

/** Насколько длинным может быть описание релиза в карточке настроек. */
const MAX_NOTES_LENGTH = 600;

export interface ReleaseInfo {
  /** Версия без префикса `v`: `1.3.0`. */
  readonly version: string;
  readonly notes: string;
  /** Страница релиза — её и открываем в браузере. */
  readonly url: string;
  readonly publishedAt: number | null;
}

/**
 * Сравнение версий вида `X.Y.Z`.
 *
 * Своё, а не через строковое сравнение: `"1.10.0" < "1.9.0"` как строки, и
 * приложение перестало бы замечать обновления ровно на десятом минорном
 * релизе — то есть ошибка проявилась бы через полгода и молча.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }
  return 0;
}

function parseVersion(raw: string): [number, number, number] {
  const parts = raw
    .trim()
    .replace(/^v/i, '')
    // Отбрасываем пред-релизный хвост (`1.3.0-rc.1`): для «новее / не новее»
    // он не нужен, а разбирать его по правилам semver здесь не за чем.
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10));

  return [numberOrZero(parts[0]), numberOrZero(parts[1]), numberOrZero(parts[2])];
}

function numberOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Разбор ответа GitHub.
 *
 * Оборонительно: это чужой API, и приложение не должно ломаться от того,
 * что в ответе не оказалось поля. `null` означает «релиза нет или ответ
 * непонятный» — вызывающий покажет «обновлений не найдено», а не ошибку.
 */
export function parseRelease(raw: unknown): ReleaseInfo | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const release = raw as Record<string, unknown>;
  // Черновики и пред-релизы пользователям не предлагаем: их выкладывают
  // именно для того, чтобы они не разъезжались по устройствам.
  if (release.draft === true || release.prerelease === true) {
    return null;
  }

  const tag = typeof release.tag_name === 'string' ? release.tag_name : null;
  const url = typeof release.html_url === 'string' ? release.html_url : RELEASES_URL;
  if (!tag) {
    return null;
  }

  const version = tag.replace(/^v/i, '').trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return null;
  }

  const published = typeof release.published_at === 'string' ? Date.parse(release.published_at) : NaN;

  return {
    version,
    notes: trimNotes(typeof release.body === 'string' ? release.body : ''),
    url,
    publishedAt: Number.isFinite(published) ? published : null,
  };
}

/**
 * Описание релиза CI генерирует автоматически, и там бывает несколько экранов
 * ссылок на pull request'ы. В карточку настроек берём только начало.
 */
function trimNotes(body: string): string {
  const cleaned = body
    .replace(/\r\n/g, '\n')
    // Служебная таблица «какой APK кому» из шаблона релиза: в приложении она
    // бессмысленна, туда всё равно ведёт одна кнопка.
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned.length > MAX_NOTES_LENGTH
    ? `${cleaned.slice(0, MAX_NOTES_LENGTH).trimEnd()}…`
    : cleaned;
}

/** Последний релиз репозитория. Бросает при сетевой ошибке или отказе API. */
export async function fetchLatestRelease(signal?: AbortSignal): Promise<ReleaseInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);

  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });

    // Пока не выпущен ни один релиз, GitHub отвечает 404 — это не поломка.
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'GitHub временно ограничил число запросов — попробуйте позже'
          : `GitHub ответил ${response.status}`,
      );
    }
    return parseRelease(await response.json());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
