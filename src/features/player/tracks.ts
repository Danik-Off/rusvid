/**
 * Сопоставление «что выбрал пользователь» и «что понимает ExoPlayer».
 *
 * Отдельный модуль без зависимостей: в интерфейсе качество выбирается
 * человеческими «720p», а плееру нужны либо `auto`, либо конкретное число из
 * манифеста — и манифест почти никогда не совпадает с лесенкой из настроек.
 */

export interface TrackOption {
  readonly index: number;
  readonly label: string;
  /** Высота кадра для видеодорожек — по ней сортируем и подписываем. */
  readonly height?: number;
  readonly language?: string;
}

/** Выбор дорожки: авто или конкретный индекс/высота. */
export type QualitySelection = 'auto' | number;

export type QualityTrack = { readonly type: 'auto' } | { readonly type: 'resolution'; readonly value: number };

/**
 * Дорожка, которую надо отдать ExoPlayer при выбранном качестве.
 *
 * Точного совпадения может не быть (у платформы 1088 вместо 1080), поэтому
 * берём лучшее, что не выше запрошенного. Если весь манифест выше потолка —
 * отдаём самую низкую дорожку: показать что-то важнее, чем соблюсти лимит.
 */
export function resolveQualityTrack(
  tracks: readonly TrackOption[],
  quality: QualitySelection,
): QualityTrack {
  if (quality === 'auto') {
    return { type: 'auto' };
  }
  const heights = tracks
    .map((track) => track.height)
    .filter((height): height is number => typeof height === 'number' && height > 0);
  if (heights.length === 0) {
    return { type: 'auto' };
  }
  const notAbove = heights.filter((height) => height <= quality);
  const value = notAbove.length > 0 ? Math.max(...notAbove) : Math.min(...heights);
  return { type: 'resolution', value };
}

/**
 * Высоты кадра, которые реально есть в манифесте, по убыванию и без повторов.
 * Показывать пользователю сырые индексы дорожек бессмысленно.
 */
export function qualityLadder(tracks: readonly TrackOption[]): number[] {
  const heights = new Set<number>();
  for (const track of tracks) {
    if (typeof track.height === 'number' && track.height > 0) {
      heights.add(track.height);
    }
  }
  return [...heights].sort((left, right) => right - left);
}
