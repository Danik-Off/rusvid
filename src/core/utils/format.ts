/** Форматирование чисел и дат для UI. Русская локаль. */

/** 3725 -> "1:02:05", 125 -> "2:05". */
export function formatDuration(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * То же, что {@link formatDuration}, но всегда возвращает строку.
 *
 * Отдельная функция, потому что назначение другое: в карточке отсутствующая
 * длительность просто не рисуется (отсюда `null`), а таймер плеера обязан
 * показывать «0:00» с первой секунды — иначе он мигает пустотой при старте.
 */
export function formatClock(seconds: number | undefined): string {
  return formatDuration(seconds) ?? '0:00';
}

/** 1234 -> "1,2 тыс.", 7180693 -> "7,2 млн". */
export function formatViews(views: number | undefined): string | null {
  if (views === undefined || !Number.isFinite(views) || views < 0) {
    return null;
  }
  if (views < 1000) {
    return `${views}`;
  }
  if (views < 1_000_000) {
    return `${trimZero(views / 1000)} тыс.`;
  }
  return `${trimZero(views / 1_000_000)} млн`;
}

/** Относительная дата: «сегодня», «3 дня назад», «12.05.2025». */
export function formatPublishedAt(iso: string | undefined, now: Date = new Date()): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays < 0) {
    return date.toLocaleDateString('ru-RU');
  }
  if (diffDays === 0) {
    return 'сегодня';
  }
  if (diffDays === 1) {
    return 'вчера';
  }
  if (diffDays < 7) {
    return `${diffDays} ${plural(diffDays, 'день', 'дня', 'дней')} назад`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${plural(weeks, 'неделю', 'недели', 'недель')} назад`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')} назад`;
  }
  return date.toLocaleDateString('ru-RU');
}

/** Русские окончания: 1 день, 2 дня, 5 дней. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return many;
  }
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }
  return many;
}

function trimZero(value: number): string {
  const rounded = value.toFixed(1);
  return rounded.endsWith('.0')
    ? rounded.slice(0, -2)
    : rounded.replace('.', ','); // «1,2» вместо «1.2»
}
