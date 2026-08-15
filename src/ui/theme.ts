/**
 * Дизайн-токены.
 *
 * Тема одна (тёмная) — в видеоприложении она уместнее и её проще держать
 * согласованной. Ни один компонент не пишет цвет литералом: всё берётся
 * отсюда, поэтому перекрасить приложение целиком можно из одного файла.
 *
 * Палитра построена на холодном нейтральном ряду (`ink`) с единственным
 * акцентом: платформы уже приносят свои фирменные цвета в карточки,
 * и второй акцент интерфейса конфликтовал бы с ними.
 */

const ink = {
  900: '#0B0D12', // фон приложения
  800: '#12151C', // фон панелей (таб-бар, шапка)
  700: '#181C25', // карточка
  600: '#212734', // приподнятая поверхность, скелетоны
  500: '#2C3444', // границы
  400: '#3B4557',
} as const;

export const colors = {
  background: ink[900],
  surface: ink[700],
  surfaceElevated: ink[600],
  surfaceSunken: ink[800],
  border: ink[500],
  borderStrong: ink[400],

  textPrimary: '#F4F6FA',
  textSecondary: '#A3ADBE',
  textMuted: '#6E7889',
  textInverse: '#0B0D12',

  accent: '#5B8CFF',
  accentSoft: 'rgba(91,140,255,0.14)',
  danger: '#FF6B6B',
  dangerSoft: 'rgba(255,107,107,0.14)',
  warning: '#FFC145',
  warningSoft: 'rgba(255,193,69,0.14)',
  success: '#43D9A3',

  scrim: 'rgba(0,0,0,0.66)',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/**
 * Типографика: один шаг между размерами, чтобы иерархия читалась
 * без «почти одинаковых» кеглей.
 */
export const typography = {
  display: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  badge: { fontSize: 10, lineHeight: 12, fontWeight: '800' },
} as const;

/** Тени на Android — это elevation; держим два уровня, чтобы не мельтешило. */
export const elevation = {
  card: {
    elevation: 2,
    shadowColor: colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sheet: {
    elevation: 8,
    shadowColor: colors.black,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
  },
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
