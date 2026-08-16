/**
 * Разбор идентификатора видео VK и сборка ссылок из него.
 *
 * Ключевой факт, на котором держится воспроизведение: встроенный плеер VK
 * (`video_ext.php`) открывается **без авторизации** — достаточно знать
 * владельца и номер видео. Поэтому ролик откроется, даже если API недоступен,
 * а пользователь никуда не входил: id есть в карточке — значит, видео сыграет.
 *
 * Домен здесь `vk.com`, а не `vkvideo.ru`, и это не косметика: анонимный
 * заход на `vkvideo.ru/video_ext.php` отвечает редиректом на автологин, а на
 * `vk.com` тот же плеер отдаётся сразу.
 */

import { ProviderError } from '../../core/errors/ProviderError';

/** `-22822305_456241864` или `-22822305_456241864_a1b2c3` (с ключом доступа). */
export interface VkVideoId {
  /** Владелец: отрицательный у сообществ, положительный у пользователей. */
  readonly ownerId: string;
  readonly videoId: string;
  /** Ключ доступа для приватных и ограниченных видео. */
  readonly accessKey?: string;
}

const ID_PATTERN = /^(-?\d+)_(\d+)(?:_([0-9a-zA-Z]+))?$/;

export function parseVkVideoId(raw: string): VkVideoId {
  const match = ID_PATTERN.exec(raw.trim());
  if (!match) {
    throw new ProviderError({
      code: 'NOT_FOUND',
      providerId: 'vk',
      message: `Некорректный идентификатор видео VK: "${raw}"`,
    });
  }
  return { ownerId: match[1], videoId: match[2], accessKey: match[3] };
}

export function formatVkVideoId(id: VkVideoId): string {
  const base = `${id.ownerId}_${id.videoId}`;
  return id.accessKey ? `${base}_${id.accessKey}` : base;
}

/**
 * Ссылка на встроенный плеер.
 *
 * `hd=2` просит максимальное доступное качество, `autoplay=1` избавляет от
 * второго тапа уже внутри WebView, `js_api=1` включает postMessage-API плеера
 * (пригодится, если понадобится читать состояние воспроизведения).
 */
export function buildVkEmbedUrl(id: VkVideoId, hash?: string): string {
  const params = [`oid=${id.ownerId}`, `id=${id.videoId}`, 'hd=2', 'autoplay=1', 'js_api=1'];
  // В embed ключ доступа называется `hash`. Тот, что пришёл вместе с
  // карточкой, точнее выведенного из идентификатора, поэтому он в приоритете.
  const key = hash ?? id.accessKey;
  if (key) {
    params.push(`hash=${encodeURIComponent(key)}`);
  }
  return `https://vk.com/video_ext.php?${params.join('&')}`;
}

/** Страница видео на сайте — для «Открыть на сайте» и «Поделиться». */
export function buildVkWebUrl(id: VkVideoId): string {
  return `https://vk.com/video${id.ownerId}_${id.videoId}`;
}

/**
 * Ключ доступа из ссылки на плеер, которую отдаёт API (поле `player`).
 *
 * Часть видео без него не открывается, а вывести его из идентификатора
 * нельзя — платформа выдаёт его только вместе с карточкой. Поэтому
 * `resolvePlayback` спрашивает карточку, но не зависит от ответа: не вышло —
 * играем по идентификатору, и большинство роликов откроется и так.
 */
export function extractVkPlayerHash(player: string | undefined): string | undefined {
  const match = player ? /[?&]hash=([^&#]+)/.exec(player) : null;
  return match ? decodeURIComponent(match[1]) : undefined;
}
