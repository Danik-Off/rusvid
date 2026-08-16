#!/usr/bin/env node
/**
 * Считает версию следующего релиза — без участия человека.
 *
 * База — последний тег `vX.Y.Z` в репозитории (а не package.json: тег есть
 * факт выпуска, package.json можно забыть поднять). Шаг определяется по
 * сообщениям коммитов с этого тега в стиле Conventional Commits:
 *
 *   feat!: ... | BREAKING CHANGE в теле   -> major
 *   feat: ...                             -> minor
 *   всё остальное                         -> patch
 *
 * Если версия в package.json выше вычисленной, берётся она: ручной
 * `npm run release:minor` остаётся рабочим способом задать версию явно.
 *
 * Печатает в stdout строки `ключ=значение` для $GITHUB_OUTPUT, а поясняющий
 * текст — в stderr, чтобы одно не попадало в другое.
 *
 * Использование:
 *   node tools/next-version.mjs            # BUMP=auto по умолчанию
 *   BUMP=minor node tools/next-version.mjs # шаг задан вручную
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

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
    .filter(tag => TAG_RE.test(tag))
    .sort((a, b) => compare(a.slice(1), b.slice(1)))
    .pop() ?? null;

/** Шаг версии по списку полных сообщений коммитов. */
export const bumpFromCommits = commits => {
  const subjects = commits.map(message => message.split('\n')[0]);
  if (
    subjects.some(subject => /^[a-z]+(\([^)]*\))?!:/i.test(subject)) ||
    commits.some(message => /^BREAKING[ -]CHANGE:/im.test(message))
  ) {
    return 'major';
  }
  if (subjects.some(subject => /^feat(\([^)]*\))?:/i.test(subject))) {
    return 'minor';
  }
  return 'patch';
};

export const applyBump = (version, bump) => {
  const [major, minor, patch] = parse(version);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

/**
 * Чистая логика — вся ветвистость собрана здесь, чтобы её можно было
 * проверить без git и без CI.
 */
export const nextVersion = ({ tags, packageVersion, commits, bump = 'auto' }) => {
  const tag = latestTag(tags);

  // Первый релиз: тегов ещё нет, версия в package.json и есть та, которую
  // нужно зафиксировать. Поднимать её не за что — предыдущего выпуска не было.
  if (!tag) {
    return {
      version: packageVersion,
      previous: '',
      bump: 'initial',
      reason: `тегов нет — фиксируем текущую версию package.json (${packageVersion})`,
    };
  }

  const previous = tag.slice(1);

  if (commits.length === 0 && bump === 'auto') {
    return {
      version: previous,
      previous,
      bump: 'none',
      reason: `с тега ${tag} новых коммитов нет`,
      skip: true,
    };
  }

  const step = bump === 'auto' ? bumpFromCommits(commits) : bump;
  const computed = applyBump(previous, step);

  // Версию могли поднять руками (npm run release:minor) — она главнее
  // вычисленной, иначе ручной minor молча превратился бы в patch.
  if (compare(packageVersion, computed) > 0) {
    return {
      version: packageVersion,
      previous,
      bump: 'manual',
      reason: `версия из package.json (${packageVersion}) выше вычисленной (${computed})`,
    };
  }

  return {
    version: computed,
    previous,
    bump: step,
    reason:
      bump === 'auto'
        ? `${commits.length} коммит(ов) с тега ${tag} -> ${step}`
        : `шаг ${step} задан вручную`,
  };
};

// --- CLI -------------------------------------------------------------------

const main = () => {
  const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const tags = git('tag', '--list', 'v*').split('\n').filter(Boolean);
  const tag = latestTag(tags);

  // %B — полное сообщение вместе с телом (нужно для BREAKING CHANGE),
  // \0 как разделитель: в теле коммита может быть что угодно, кроме NUL.
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const commits = git('log', '-z', '--format=%B', range).split('\0').map(c => c.trim()).filter(Boolean);

  const result = nextVersion({
    tags,
    packageVersion,
    commits,
    bump: process.env.BUMP && process.env.BUMP !== '' ? process.env.BUMP : 'auto',
  });

  const skip = result.skip === true;
  process.stderr.write(
    `Версия: ${result.previous || '—'} -> ${result.version} (${result.bump}): ${result.reason}\n`,
  );
  if (tags.includes(`v${result.version}`) && !skip) {
    process.stderr.write(`Тег v${result.version} уже существует — релиз пропускаем.\n`);
    process.stdout.write(`version=${result.version}\nshould_release=false\n`);
    return;
  }

  process.stdout.write(
    `version=${result.version}\nprevious=${result.previous}\nbump=${result.bump}\nshould_release=${skip ? 'false' : 'true'}\n`,
  );
};

// Запуск как скрипта, но не при импорте из тестов.
if (process.argv[1] && process.argv[1].endsWith('next-version.mjs')) {
  main();
}
