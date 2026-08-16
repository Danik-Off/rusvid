#!/usr/bin/env node
/**
 * Решает, выпускать ли релиз с текущей версией `package.json`.
 *
 * Единственный источник версии — `package.json`. Релиз выходит тогда и только
 * тогда, когда версию в нём подняли: тега `v<version>` ещё нет. Никаких
 * вычислений по коммитам и никакого коммита версии от бота обратно в main —
 * версию поднимает человек (`npm run release:minor`) одним коммитом вместе с
 * кодом.
 *
 * Печатает в stdout строки `ключ=значение` для $GITHUB_OUTPUT, а поясняющий
 * текст — в stderr, чтобы одно не попадало в другое.
 *
 * Использование:
 *   node tools/release-version.mjs   # покажет, выйдет ли релиз и почему
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const parse = version => version.split('.').map(Number);
const compare = (a, b) => {
  const x = parse(a);
  const y = parse(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/** Последний по значению (а не по дате) тег вида vX.Y.Z. */
export const latestTag = tags =>
  tags
    .filter(tag => SEMVER_RE.test(tag.slice(1)) && tag.startsWith('v'))
    .sort((a, b) => compare(a.slice(1), b.slice(1)))
    .pop() ?? null;

/**
 * Чистое решение — вся ветвистость собрана здесь, чтобы её можно было
 * проверить без git и без CI.
 *
 * @param version      версия из package.json
 * @param lockVersions версии из package-lock.json (корневая и packages[''])
 * @param tags         существующие теги репозитория
 */
export const releaseDecision = ({ version, lockVersions = [], tags = [] }) => {
  if (!SEMVER_RE.test(version ?? '')) {
    return { version, error: `версия "${version}" в package.json не вида X.Y.Z` };
  }

  // npm ci падает на рассинхроне package.json и package-lock.json с невнятным
  // текстом — ловим это здесь, до часовой сборки. `npm version` правит оба
  // файла, так что рассинхрон означает «поправили версию руками в одном».
  const stale = lockVersions.filter(Boolean).find(lock => lock !== version);
  if (stale) {
    return {
      version,
      error: `в package-lock.json версия ${stale}, а в package.json ${version} — поднимайте версию через npm version, а не руками`,
    };
  }

  if (tags.includes(`v${version}`)) {
    return {
      version,
      shouldRelease: false,
      reason: `тег v${version} уже стоит — версию не поднимали, релизить нечего`,
    };
  }

  const previous = latestTag(tags);
  if (previous && compare(version, previous.slice(1)) < 0) {
    return {
      version,
      error: `версия ${version} ниже уже выпущенной ${previous.slice(1)} — Android не примет обновление с меньшим versionCode`,
    };
  }

  return {
    version,
    previous: previous ? previous.slice(1) : '',
    shouldRelease: true,
    reason: previous
      ? `версия поднята: ${previous.slice(1)} -> ${version}`
      : `первый релиз: ${version}`,
  };
};

// --- CLI -------------------------------------------------------------------

const main = () => {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

  let lockVersions = [];
  try {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    lockVersions = [lock.version, lock.packages?.['']?.version];
  } catch {
    // Лока может не быть (свежий клон без него) — это не повод не релизить.
  }

  const tags = git('tag', '--list', 'v*').split('\n').filter(Boolean);
  const result = releaseDecision({ version, lockVersions, tags });

  if (result.error) {
    process.stderr.write(`::error::${result.error}\n`);
    process.exitCode = 1;
    return;
  }

  process.stderr.write(`Версия ${result.version}: ${result.reason}\n`);
  process.stdout.write(
    `version=${result.version}\nprevious=${result.previous ?? ''}\nshould_release=${result.shouldRelease}\n`,
  );
};

// Запуск как скрипта, но не при импорте из тестов.
if (process.argv[1] && process.argv[1].endsWith('release-version.mjs')) {
  main();
}
