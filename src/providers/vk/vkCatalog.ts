/**
 * Разбор «каталога» VK Видео.
 *
 * Витрина и поиск отвечают не списком, а конструктором интерфейса: секция →
 * блоки → строковые ключи вида `"-99085029_456241689"`, а сами объекты видео
 * лежат отдельно, причём в двух местах сразу — `videos[]` и
 * `catalog_videos[].video`. Раскладка блоков у VK плавающая: в одном ответе
 * подборка приходит полосой, в другом — сеткой, между ними ещё фильтры и
 * заголовки. Поэтому разбор устроен оборонительно: порядок берём из блоков,
 * если он там есть, но ни одного видео не теряем, даже если блок исчез.
 */

import type { Author, Cursor } from '../../core/model/media';
import type {
  VkCatalogResponseDto,
  VkCatalogSectionDto,
  VkGroupDto,
  VkProfileDto,
  VkVideoDto,
} from './vkApiTypes';

/** Авторы страницы по `owner_id` видео: у сообществ он отрицательный. */
export type VkOwnerIndex = ReadonlyMap<number, Author>;

export interface VkCatalogPage {
  readonly videos: readonly VkVideoDto[];
  readonly owners: VkOwnerIndex;
  /** Раздел, из которого пришла страница, — по нему запрашивается следующая. */
  readonly sectionId: string | null;
  readonly nextFrom: string | null;
}

export function readVkCatalogPage(dto: VkCatalogResponseDto): VkCatalogPage {
  const byKey = indexVideos(dto);
  const section = pickSection(dto);

  return {
    videos: orderVideos(byKey, section),
    owners: indexOwners(dto.groups, dto.profiles),
    sectionId: section?.id ?? null,
    nextFrom: section?.next_from ?? null,
  };
}

/**
 * Курсор следующей страницы.
 *
 * В нём и раздел, и позиция: `catalog.getSection` требует оба, а сам раздел
 * известен только из первого ответа — для поиска он вообще генерируется
 * платформой под конкретный запрос.
 */
export function encodeVkCursor(page: VkCatalogPage): Cursor | null {
  if (!page.sectionId || !page.nextFrom || page.videos.length === 0) {
    return null;
  }
  return JSON.stringify({ s: page.sectionId, f: page.nextFrom });
}

export interface VkCursorParts {
  readonly sectionId: string;
  readonly startFrom: string;
}

/** `null` — курсора нет или он из старой версии приложения: начнём сначала. */
export function decodeVkCursor(cursor: Cursor | undefined): VkCursorParts | null {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = JSON.parse(cursor) as { s?: unknown; f?: unknown };
    if (typeof parsed.s === 'string' && typeof parsed.f === 'string') {
      return { sectionId: parsed.s, startFrom: parsed.f };
    }
  } catch {
    // Курсор непрозрачен для остального приложения, но приходит он из
    // сохранённого состояния списка — пережить чужой формат обязаны.
  }
  return null;
}

/** Все разделы витрины — они же категории в UI. */
export function readVkSections(dto: VkCatalogResponseDto): readonly VkCatalogSectionDto[] {
  return dto.catalog?.sections?.filter((section) => Boolean(section.id) && Boolean(section.title)) ?? [];
}

// ---------------------------------------------------------------------------

function videoKey(video: VkVideoDto): string | null {
  return video.owner_id !== undefined && video.id !== undefined
    ? `${video.owner_id}_${video.id}`
    : null;
}

/**
 * Все объекты видео ответа по ключу.
 *
 * Одно и то же видео встречается в нагрузке по нескольку раз (полоса,
 * подборка, предзагрузка) — схлопываем, сохраняя первое вхождение: порядок
 * этой карты и есть запасной порядок выдачи.
 */
function indexVideos(dto: VkCatalogResponseDto): Map<string, VkVideoDto> {
  const byKey = new Map<string, VkVideoDto>();
  const add = (video: VkVideoDto | undefined): void => {
    const key = video && videoKey(video);
    if (key && !byKey.has(key)) {
      byKey.set(key, video as VkVideoDto);
    }
  };

  for (const video of dto.videos ?? []) {
    add(video);
  }
  for (const card of dto.catalog_videos ?? []) {
    add(card.video);
  }
  return byKey;
}

/**
 * Раздел, из которого пришли карточки.
 *
 * `catalog.getSection` отдаёт его прямо, `catalog.getVideoSearch` — внутри
 * каталога. Берём тот, где действительно есть видео: у витрины
 * (`catalog.getVideo`) первый раздел приходит с пустыми блоками, и приняв
 * его за источник, мы получили бы курсор, ведущий в пустоту.
 */
function pickSection(dto: VkCatalogResponseDto): VkCatalogSectionDto | undefined {
  if (dto.section) {
    return dto.section;
  }
  const sections = dto.catalog?.sections ?? [];
  return sections.find(hasVideoBlocks) ?? sections[0];
}

function hasVideoBlocks(section: VkCatalogSectionDto): boolean {
  return (section.blocks ?? []).some((block) => (block.videos_ids?.length ?? 0) > 0);
}

/**
 * Порядок выдачи.
 *
 * Сначала — как расставила платформа (по блокам), затем всё остальное, что
 * приехало в ответе, но ни в один блок не попало. Второе важно: раскладка
 * блоков меняется, и без запасного прохода смена вёрстки у VK превращалась
 * бы в пустой экран вместо списка.
 */
function orderVideos(
  byKey: Map<string, VkVideoDto>,
  section: VkCatalogSectionDto | undefined,
): VkVideoDto[] {
  const ordered: VkVideoDto[] = [];
  const used = new Set<string>();

  for (const block of section?.blocks ?? []) {
    for (const key of block.videos_ids ?? []) {
      const video = byKey.get(key);
      if (video && !used.has(key)) {
        used.add(key);
        ordered.push(video);
      }
    }
  }
  for (const [key, video] of byKey) {
    if (!used.has(key)) {
      ordered.push(video);
    }
  }
  return ordered;
}

function indexOwners(
  groups: readonly VkGroupDto[] | undefined,
  profiles: readonly VkProfileDto[] | undefined,
): VkOwnerIndex {
  const owners = new Map<number, Author>();

  for (const group of groups ?? []) {
    if (group.id === undefined || !group.name) {
      continue;
    }
    // У видео сообщества `owner_id` отрицательный, а `groups[].id` — нет.
    owners.set(-group.id, {
      id: String(-group.id),
      name: group.name,
      avatarUrl: group.photo_200 ?? group.photo_100 ?? group.photo_50,
      url: `https://vk.com/${group.screen_name ?? `club${group.id}`}`,
    });
  }

  for (const profile of profiles ?? []) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    if (profile.id === undefined || !name) {
      continue;
    }
    owners.set(profile.id, {
      id: String(profile.id),
      name,
      avatarUrl: profile.photo_200 ?? profile.photo_100 ?? profile.photo_50,
      url: `https://vk.com/${profile.screen_name ?? `id${profile.id}`}`,
    });
  }

  return owners;
}
