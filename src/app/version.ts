/**
 * Версия приложения — из package.json, а не константой рядом.
 *
 * В проекте уже действует правило «версия живёт в одном месте»:
 * `android/app/build.gradle` читает `package.json`, оттуда же берут версию
 * CI и тег релиза (см. .github/workflows/release.yml). Продублировать её
 * здесь числом означало бы завести четвёртое место, которое однажды
 * разъедется с остальными, — и проверка обновлений начала бы врать.
 */

// `require`, а не `import`: JSON-модули требуют `resolveJsonModule`, а
// tsconfig наследуется от @react-native/typescript-config и правится только
// ради этой строки — не стоит того. Metro разрешает JSON и так.
const packageJson = require('../../package.json') as { version: string };

export const APP_VERSION: string = packageJson.version;
