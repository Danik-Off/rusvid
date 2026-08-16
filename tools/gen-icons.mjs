/**
 * Генератор фирменной графики RusVid.
 *
 * Единственный источник геометрии логотипа: отсюда получаются и SVG-мастера
 * в assets/, и векторные drawable для Android, и растровые mipmap-иконки
 * для API 24–25 (adaptive icons работают только с API 26).
 *
 * Растеризация своя, без зависимостей: фигуры простые, а тянуть в проект
 * sharp/canvas ради пяти PNG на каждую иконку не хочется. Заливка считается
 * по знаковому расстоянию до контура, поэтому края сглажены без суперсэмплинга.
 *
 *   node tools/gen-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─────────────────────────────────────────────────────────────────────────────
// Геометрия
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Знак нарисован в сетке 96×96. Треугольник «play» задан вершинами
 * (LEFT, cy±HALF) и (APEX, cy), а затем разрезан двумя вертикальными
 * промежутками на три дольки — по одной на платформу.
 *
 * Углы скругляются не штрихом, а расширением контура на JOIN наружу: так
 * одни и те же данные пути годятся и для SVG, и для VectorDrawable, и для
 * react-native-svg, где поддержка stroke-градиентов различается.
 */
const GRID = 96;
const CY = 48;
const LEFT = 28;
const APEX = 74;
const HALF = 25.5;
const JOIN = 2;

/** Полувысота треугольника на вертикали x. */
const halfAt = (x) => (HALF * (APEX - x)) / (APEX - LEFT);

/** [начало, конец] каждой дольки; промежутки между ними — по 8. */
const SLICES = [
  [28, 38],
  [46, 54],
  [62, 74],
];

function slicePolygon([x0, x1]) {
  const top = (x) => CY - halfAt(x);
  const bottom = (x) => CY + halfAt(x);
  // Последняя долька вырождается в остриё: две точки вместо четырёх.
  if (x1 >= APEX) {
    return [
      [x0, top(x0)],
      [APEX, CY],
      [x0, bottom(x0)],
    ];
  }
  return [
    [x0, top(x0)],
    [x1, top(x1)],
    [x1, bottom(x1)],
    [x0, bottom(x0)],
  ];
}

const round = (n) => Number(n.toFixed(2));

/**
 * Контур выпуклого многоугольника, раздутый на r наружу со скруглением
 * углов: каждое ребро сдвигается по внешней нормали, соседние сдвинутые
 * рёбра соединяются дугой радиуса r с центром в исходной вершине.
 */
function offsetPath(points, r) {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p[0], 0) / n;
  const cy = points.reduce((s, p) => s + p[1], 0) / n;

  const edges = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const len = Math.hypot(dx, dy);
    let [nx, ny] = [dy / len, -dx / len];
    // Нормаль наружу — та, что уводит середину ребра от центра фигуры.
    const mx = (p[0] + q[0]) / 2 - cx;
    const my = (p[1] + q[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) [nx, ny] = [-nx, -ny];
    return {
      from: [p[0] + nx * r, p[1] + ny * r],
      to: [q[0] + nx * r, q[1] + ny * r],
    };
  });

  // Знак площади задаёт направление обхода, а он — направление дуг.
  const area = points.reduce((s, p, i) => {
    const q = points[(i + 1) % n];
    return s + (p[0] * q[1] - q[0] * p[1]);
  }, 0);
  const sweep = area > 0 ? 1 : 0;

  const xy = (p) => `${round(p[0])} ${round(p[1])}`;
  let d = `M${xy(edges[0].from)}`;
  for (let i = 0; i < n; i += 1) {
    d += `L${xy(edges[i].to)}`;
    const next = edges[(i + 1) % n];
    d += `A${r} ${r} 0 0 ${sweep} ${xy(next.from)}`;
  }
  return `${d}Z`;
}

/** Три пути знака в сетке 96×96. */
const MARK_PATHS = SLICES.map((slice) => offsetPath(slicePolygon(slice), JOIN));

/** Тот же знак, перенесённый в произвольную сетку. */
function markPathsIn(size, scale) {
  const s = (size * scale) / GRID;
  const shift = (size - GRID * s) / 2;
  return SLICES.map((slice) =>
    offsetPath(
      slicePolygon(slice).map(([x, y]) => [x * s + shift, y * s + shift]),
      JOIN * s,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Палитра (значения — из src/ui/theme.ts)
// ─────────────────────────────────────────────────────────────────────────────

const TILE_FROM = '#1B2233';
const TILE_TO = '#0A0D14';
const MARK_FROM = '#8FB2FF';
const MARK_TO = '#4A74FF';
const EDGE = '#FFFFFF';
const EDGE_ALPHA = 0.08;
const SPLASH_BG = '#0B0D12';

// ─────────────────────────────────────────────────────────────────────────────
// SVG
// ─────────────────────────────────────────────────────────────────────────────

const TILE = 256;
const TILE_INSET = 10;
const TILE_RADIUS = 58;
/** Во сколько раз сетка знака меньше стороны плитки. */
const TILE_MARK_SCALE = 0.78;

function svgTile() {
  const paths = markPathsIn(TILE, TILE_MARK_SCALE);
  const box = TILE - TILE_INSET * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}" width="${TILE}" height="${TILE}" role="img" aria-label="RusVid">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TILE_FROM}"/>
      <stop offset="1" stop-color="${TILE_TO}"/>
    </linearGradient>
    <linearGradient id="mark" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${MARK_FROM}"/>
      <stop offset="1" stop-color="${MARK_TO}"/>
    </linearGradient>
  </defs>
  <rect x="${TILE_INSET}" y="${TILE_INSET}" width="${box}" height="${box}" rx="${TILE_RADIUS}" fill="url(#tile)"/>
  <rect x="${TILE_INSET + 0.75}" y="${TILE_INSET + 0.75}" width="${box - 1.5}" height="${box - 1.5}" rx="${TILE_RADIUS - 0.75}" fill="none" stroke="${EDGE}" stroke-opacity="${EDGE_ALPHA}" stroke-width="1.5"/>
${paths.map((d) => `  <path d="${d}" fill="url(#mark)"/>`).join('\n')}
</svg>
`;
}

function svgMark() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" width="${GRID}" height="${GRID}" role="img" aria-label="RusVid">
  <defs>
    <linearGradient id="mark" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${MARK_FROM}"/>
      <stop offset="1" stop-color="${MARK_TO}"/>
    </linearGradient>
  </defs>
${MARK_PATHS.map((d) => `  <path d="${d}" fill="url(#mark)"/>`).join('\n')}
</svg>
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Android VectorDrawable
// ─────────────────────────────────────────────────────────────────────────────

function gradientFill(attr, from, to, x1, y1, x2, y2) {
  return `      <aapt:attr name="android:${attr}">
        <gradient
            android:type="linear"
            android:startX="${x1}" android:startY="${y1}"
            android:endX="${x2}" android:endY="${y2}"
            android:startColor="${from}"
            android:endColor="${to}"/>
      </aapt:attr>`;
}

/**
 * Фон adaptive icon. Рисуется на всю площадь 108×108: система сама
 * обрежет его своей маской, поэтому скруглений здесь быть не должно.
 */
function vectorBackground() {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Сгенерировано tools/gen-icons.mjs — правьте генератор, а не этот файл. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
  <path android:pathData="M0,0h108v108h-108z">
${gradientFill('fillColor', TILE_FROM, TILE_TO, 0, 0, 108, 108)}
  </path>
</vector>
`;
}

/**
 * Передний план adaptive icon. Сетка знака 96×96 растянута на холст 108×108,
 * так что знак остаётся внутри безопасной зоны 72×72.
 */
function vectorForeground() {
  const paths = markPathsIn(108, GRID / 108);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Сгенерировано tools/gen-icons.mjs — правьте генератор, а не этот файл. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${paths
  .map(
    (d) => `  <path android:pathData="${d}">
${gradientFill('fillColor', MARK_FROM, MARK_TO, 26, 20, 82, 76)}
  </path>`,
  )
  .join('\n')}
</vector>
`;
}

/** Монохромный слой для тематических иконок Android 13+: цвет задаёт система. */
function vectorMonochrome() {
  const paths = markPathsIn(108, GRID / 108);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Сгенерировано tools/gen-icons.mjs — правьте генератор, а не этот файл. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108"
    android:tint="?attr/colorControlNormal">
${paths.map((d) => `  <path android:pathData="${d}" android:fillColor="#FFFFFF"/>`).join('\n')}
</vector>
`;
}

/** Логотип целиком (плитка + знак) — для сплэша и прочих мест в вёрстке. */
function vectorLogo() {
  const paths = markPathsIn(TILE, TILE_MARK_SCALE);
  const box = TILE - TILE_INSET * 2;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Сгенерировано tools/gen-icons.mjs — правьте генератор, а не этот файл. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="${TILE}dp"
    android:height="${TILE}dp"
    android:viewportWidth="${TILE}"
    android:viewportHeight="${TILE}">
  <path android:pathData="${roundedRectPath(TILE_INSET, TILE_INSET, box, box, TILE_RADIUS)}">
${gradientFill('fillColor', TILE_FROM, TILE_TO, TILE_INSET, TILE_INSET, TILE - TILE_INSET, TILE - TILE_INSET)}
  </path>
${paths
  .map(
    (d) => `  <path android:pathData="${d}">
${gradientFill('fillColor', MARK_FROM, MARK_TO, 70, 52, 190, 200)}
  </path>`,
  )
  .join('\n')}
</vector>
`;
}

/** VectorDrawable не знает про rx у прямоугольника — рисуем путь руками. */
function roundedRectPath(x, y, w, h, r) {
  return (
    `M${x + r},${y}` +
    `h${w - 2 * r}` +
    `a${r},${r} 0 0 1 ${r},${r}` +
    `v${h - 2 * r}` +
    `a${r},${r} 0 0 1 ${-r},${r}` +
    `h${-(w - 2 * r)}` +
    `a${r},${r} 0 0 1 ${-r},${-r}` +
    `v${-(h - 2 * r)}` +
    `a${r},${r} 0 0 1 ${r},${-r}z`
  );
}

function adaptiveIcon() {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;
}

function launchScreen() {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Окно до первого кадра React Native. Без него на светлой теме системы
  между запуском и монтированием JS проскакивает белая вспышка.
-->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_background"/>
    <item
        android:gravity="center"
        android:width="132dp"
        android:height="132dp"
        android:drawable="@drawable/ic_logo"/>
</layer-list>
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Растеризация
// ─────────────────────────────────────────────────────────────────────────────

/** Дуга в записи «endpoint» → ломаная (нужны только круговые дуги, rx == ry). */
function flattenArc(from, to, r, sweep, out) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const scale = Math.max(1, Math.hypot(dx, dy) / r);
  const rr = r * scale;
  const sq = Math.max(0, rr * rr - (dx * dx + dy * dy));
  // Знак по спецификации SVG: «+», когда large-arc ≠ sweep (large-arc здесь всегда 0).
  const coef = Math.sqrt(sq / (dx * dx + dy * dy || 1)) * (sweep ? 1 : -1);
  const cx = coef * dy + (x1 + x2) / 2;
  const cy = -coef * dx + (y1 + y2) / 2;

  let a1 = Math.atan2(y1 - cy, x1 - cx);
  let a2 = Math.atan2(y2 - cy, x2 - cx);
  let delta = a2 - a1;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;

  const steps = Math.max(2, Math.ceil((Math.abs(delta) / Math.PI) * 24));
  for (let i = 1; i <= steps; i += 1) {
    const a = a1 + (delta * i) / steps;
    out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
}

/**
 * Разбор пути в ломаную. Поддерживается ровно то подмножество, которое
 * порождает offsetPath: абсолютные M, L, A и Z.
 */
function pathToPolygon(d) {
  const tokens = d.match(/[MLAZ]|-?\d*\.?\d+/g) ?? [];
  const points = [];
  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    if (/[MLAZ]/.test(tokens[i])) {
      cmd = tokens[i];
      i += 1;
      if (cmd === 'Z') continue;
    }
    const num = () => Number(tokens[i++]);
    if (cmd === 'M' || cmd === 'L') {
      points.push([num(), num()]);
    } else if (cmd === 'A') {
      const r = num();
      num(); // ry — всегда равен rx
      num(); // поворот оси
      num(); // large-arc
      const sweep = num();
      const to = [num(), num()];
      flattenArc(points[points.length - 1], to, r, sweep === 1, points);
    }
  }
  // Замыкающая дуга приходит ровно в стартовую точку — совпадающие вершины
  // дали бы ребро нулевой длины и NaN в расчёте расстояния.
  return points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-9,
  );
}

/** Знаковое расстояние до многоугольника: <0 внутри. */
function sdPolygon(points, px, py) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const ex = xj - xi;
    const ey = yj - yi;
    const len2 = ex * ex + ey * ey;
    if (len2 === 0) continue;
    const wx = px - xi;
    const wy = py - yi;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / len2));
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return Math.sqrt(d) * (inside ? -1 : 1);
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Покрытие пикселя по знаковому расстоянию — сглаживание шириной в пиксель. */
const coverage = (d) => clamp01(0.5 - d);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const s = clamp01(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * s),
    Math.round(a[1] + (b[1] - a[1]) * s),
    Math.round(a[2] + (b[2] - a[2]) * s),
  ];
}

/** Наложение цвета на буфер с premultiplied-независимым alpha-blend. */
function blend(buf, idx, rgb, alpha) {
  if (alpha <= 0) return;
  const dstA = buf[idx + 3] / 255;
  const outA = alpha + dstA * (1 - alpha);
  for (let c = 0; c < 3; c += 1) {
    const src = rgb[c] / 255;
    const dst = buf[idx + c] / 255;
    buf[idx + c] = Math.round(((src * alpha + dst * dstA * (1 - alpha)) / outA) * 255);
  }
  buf[idx + 3] = Math.round(outA * 255);
}

/**
 * Отрисовка иконки размером size×size.
 * shape: 'squircle' — скруглённый квадрат, 'circle' — круг под ic_launcher_round.
 */
function renderIcon(size, shape) {
  const buf = new Uint8Array(size * size * 4);
  const k = size / TILE;

  const inset = TILE_INSET * k;
  const half = (size - inset * 2) / 2;
  const center = size / 2;
  const radius = shape === 'circle' ? half : TILE_RADIUS * k;

  const tileFrom = hexToRgb(TILE_FROM);
  const tileTo = hexToRgb(TILE_TO);
  const markFrom = hexToRgb(MARK_FROM);
  const markTo = hexToRgb(MARK_TO);
  const edge = hexToRgb(EDGE);

  const marks = markPathsIn(TILE, TILE_MARK_SCALE).map((d) =>
    pathToPolygon(d).map(([x, y]) => [x * k, y * k]),
  );
  // Границы знака — по ним же строится его градиент.
  const xs = marks.flat().map((p) => p[0]);
  const ys = marks.flat().map((p) => p[1]);
  const [mx0, mx1] = [Math.min(...xs), Math.max(...xs)];
  const [my0, my1] = [Math.min(...ys), Math.max(...ys)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const idx = (y * size + x) * 4;

      const dTile = sdRoundedBox(px, py, center, center, half, half, radius);
      const tileA = coverage(dTile);
      if (tileA > 0) {
        const t = (px - inset + (py - inset)) / (2 * (size - inset * 2));
        blend(buf, idx, mix(tileFrom, tileTo, t), tileA);
      }

      // Волосяная светлая кромка: полоса внутрь от края плитки.
      const ringA = coverage(Math.abs(dTile + 0.75) - 0.75) * EDGE_ALPHA;
      if (ringA > 0) blend(buf, idx, edge, ringA);

      let markA = 0;
      for (const poly of marks) markA = Math.max(markA, coverage(sdPolygon(poly, px, py)));
      if (markA > 0) {
        const t = ((px - mx0) / (mx1 - mx0)) * 0.55 + ((py - my0) / (my1 - my0)) * 0.45;
        blend(buf, idx, mix(markFrom, markTo, t), markA);
      }
    }
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// PNG
// ─────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // фильтр None: картинки маленькие, экономить нечего
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────

function write(relative, content) {
  const file = join(ROOT, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log('  ' + relative.replace(/\\/g, '/'));
}

/** Плотности legacy-иконок: adaptive icon покрывает API 26+, эти — 24–25. */
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

console.log('assets:');
write('assets/logo.svg', svgTile());
write('assets/logo-mark.svg', svgMark());

console.log('android vector:');
write('android/app/src/main/res/drawable/ic_launcher_background.xml', vectorBackground());
write('android/app/src/main/res/drawable/ic_launcher_foreground.xml', vectorForeground());
write('android/app/src/main/res/drawable/ic_launcher_monochrome.xml', vectorMonochrome());
write('android/app/src/main/res/drawable/ic_logo.xml', vectorLogo());
write('android/app/src/main/res/drawable/launch_screen.xml', launchScreen());
write('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', adaptiveIcon());
write('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptiveIcon());

console.log('android raster:');
for (const [density, size] of Object.entries(DENSITIES)) {
  write(
    `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
    encodePng(renderIcon(size, 'squircle'), size),
  );
  write(
    `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
    encodePng(renderIcon(size, 'circle'), size),
  );
}

// Logo.tsx держит те же пути литералами — печатаем их, чтобы после правки
// геометрии было что туда перенести.
console.log('\nПути знака в сетке 96×96 (для src/ui/components/Logo.tsx):');
for (const d of MARK_PATHS) console.log('  ' + d);
