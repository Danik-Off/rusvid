# Локальная сборка (Windows)

Проект собирается **полностью локально**, без Expo, EAS и облачных сервисов.

## Что уже установлено на этой машине

При настройке проекта установлено и прописано:

| Компонент | Версия | Путь |
|---|---|---|
| Node.js | 22.19 | системный |
| Microsoft OpenJDK | 17.0.20 | `C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot` |
| Android SDK | — | `C:\Android\Sdk` |
| SDK Platform | android-37.0 | |
| Build-Tools | 37.0.0 | |
| NDK | 27.1.12297006 | |
| CMake | 3.22.1 | |

Переменные окружения (`JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `PATH`)
записаны в пользовательский профиль, `android/local.properties` создан.

> `local.properties` содержит абсолютный путь к SDK и **не коммитится** —
> он уже в `.gitignore` шаблона React Native.

## Установка с нуля на другой машине

```powershell
# 1. JDK 17 (React Native 0.87 не работает с JDK 8/11)
winget install --id Microsoft.OpenJDK.17 -e

# 2. Android SDK command-line tools
$sdk = 'C:\Android\Sdk'
New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
Invoke-WebRequest 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' -OutFile "$env:TEMP\clt.zip"
Expand-Archive "$env:TEMP\clt.zip" "$sdk\cmdline-tools\_tmp"
Move-Item "$sdk\cmdline-tools\_tmp\cmdline-tools" "$sdk\cmdline-tools\latest"

# 3. Пакеты SDK
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=$sdk --licenses
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=$sdk `
    "platform-tools" "platforms;android-37.0" "build-tools;37.0.0" `
    "ndk;27.1.12297006" "cmake;3.22.1"

# 4. Переменные окружения
[Environment]::SetEnvironmentVariable('JAVA_HOME', $env:JAVA_HOME, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdk, 'User')

# 5. Зависимости проекта
npm install
```

Если `sdkmanager --licenses` не принимает ввод в неинтерактивной консоли,
лицензии можно записать вручную — файлами в `C:\Android\Sdk\licenses\`
(имя файла = имя лицензии, содержимое = её хэш).

---

## Команды

| Команда | Что делает |
|---|---|
| `npm run release:patch` | поднимает версию в `package.json` — коммит и push заставляют CI поставить тег |
| `npm start` | Metro-бандлер |
| `npm run android` | debug-сборка + установка на устройство/эмулятор |
| `npm run android:release` | release-сборка + установка |
| `npm run build:apk` | APK под `arm64-v8a` и `armeabi-v7a` в `android/app/build/outputs/apk/release/` |
| `npm run build:apk:all` | то же, но со всеми ABI, включая x86 для эмулятора |
| `npm run build:bundle` | AAB для Play Console |
| `npm run clean:android` | `gradlew clean` |
| `npm test` | юнит-тесты |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Запуск на устройстве

```powershell
adb devices                       # телефон в режиме отладки по USB
npm run android
```

Для эмулятора добавьте образ и создайте AVD:

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" "system-images;android-36;google_apis;x86_64"
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat" create avd -n rusvid -k "system-images;android-36;google_apis;x86_64"
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd rusvid
```

---

## Размер APK

`npm run build:apk` кладёт в `android/app/build/outputs/apk/release/` два
файла — по одному на ABI:

| APK | Размер |
|---|---|
| `app-arm64-v8a-release.apk` | ~20 МБ |
| `app-armeabi-v7a-release.apk` | ~16 МБ |

Раньше это был один универсальный APK на **75 МБ**. Откуда взялась разница
(цифры — arm64):

| Настройка в `android/app/build.gradle` | Что даёт |
|---|---|
| `splits { abi { … universalApk false } }` | нативка одной ABI вместо четырёх: 59 → 15 МБ |
| `enableProguardInReleaseBuilds = true` | R8 выбрасывает неиспользуемый androidx/media3/OkHttp: dex 22 → 4 МБ |
| `shrinkResources true` | ресурсы без ссылок из кода: `res` + `resources.arsc` 2,5 → 1,1 МБ |
| `androidResources { localeFilters }` | переводы только `ru`/`en` вместо ~80 языков |

Какие ABI собирать, решает свойство `reactNativeArchitectures`. В
`gradle.properties` перечислены все четыре, чтобы работал x86-эмулятор;
`build:apk` передаёт только телефонные:

```powershell
npm run build:apk       # arm64-v8a + armeabi-v7a
npm run build:apk:all   # все четыре ABI, включая x86 для эмулятора
```

### Если минификация что-то сломает

R8 переименовывает классы, и код, который ищет класс по имени, ломается
молча — в рантайме, а не на сборке. Правила `keep` для React Native, media3,
OkHttp и AndroidX лежат внутри их же AAR (consumer-rules), поэтому
[`android/app/proguard-rules.pro`](../android/app/proguard-rules.pro) почти
пуст. Самый нужный случай уже покрыт: `HlsMediaSource$Factory` сохраняется
по имени, а CI проверяет его наличие в готовом APK.

Расшифровать стек-трейс из release-краша:

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\retrace.bat" `
    android\app\build\outputs\mapping\release\mapping.txt trace.txt
```

`mapping.txt` перезаписывается каждой сборкой — для выпущенной версии его
стоит сохранить до того, как соберёте следующую.

## Версия приложения

Единственный источник истины — поле `version` в `package.json`.
`android/app/build.gradle` читает его на этапе конфигурации:

```groovy
def packageJson = new groovy.json.JsonSlurper().parseText(file("../../package.json").text)
def appVersionName = packageJson.version          // 1.2.3
// versionCode обязан быть целым и монотонным: 1.2.3 -> 10203
```

Поэтому номер нигде не дублируется, а `npm run release:patch` поднимает
версию сразу и в npm-пакете, и в локально собранном APK, и в теге, который
поставит CI.

Ограничение схемы `versionCode`: `minor` и `patch` должны быть меньше 100 —
сборка падает с понятным сообщением, если это нарушено.

## Подпись release-сборки

По умолчанию release подписывается **отладочным** ключом из шаблона React
Native (`android/app/debug.keystore`). Такой APK устанавливается и работает —
для сборки «себе на телефон» этого достаточно, и дальше можно не читать.
Свой ключ нужен, если вы собираетесь обновлять приложение поверх: Android
не даст поставить обновление, подписанное другим ключом.

Свой ключ:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -storetype PKCS12 -keystore android/app/rusvid-release.keystore `
  -alias rusvid -keyalg RSA -keysize 2048 -validity 10000
```

Пароли — в `android/gradle.properties` (файл **не коммитить**):

```properties
RUSVID_STORE_FILE=rusvid-release.keystore
RUSVID_KEY_ALIAS=rusvid
RUSVID_STORE_PASSWORD=…
RUSVID_KEY_PASSWORD=…
```

И в `android/app/build.gradle`:

```groovy
signingConfigs {
    release {
        storeFile file(RUSVID_STORE_FILE)
        storePassword RUSVID_STORE_PASSWORD
        keyAlias RUSVID_KEY_ALIAS
        keyPassword RUSVID_KEY_PASSWORD
    }
}
buildTypes {
    release { signingConfig signingConfigs.release }
}
```

---

## Обязательные флаги сборки

В `android/gradle.properties` есть блок `RNVideo_*` — **не удаляйте его**.

`react-native-video` подключает модули ExoPlayer по флагам, и каждый из них
по умолчанию **выключен**:

```groovy
// node_modules/react-native-video/android/build.gradle
def ExoplayerDependencies = ExoplayerDependenciesList.collectEntries { property ->
    [(property): safeExtGet(property)?.toBoolean() ?: false]   // ← default: false
}
```

Без `RNVideo_useExoplayerHls=true` в APK не попадает
`androidx.media3:media3-exoplayer-hls`, и **ни один HLS-поток не играет** —
а HLS используют и Rutube, и Sasflix. Сборка при этом проходит успешно,
ошибка видна только на устройстве, поэтому её легко пропустить.

Проверить, что флаг применился, можно по выводу сборки:

```powershell
cd android; .\gradlew.bat assembleRelease | Select-String 'useExoplayer'
# useExoplayerHls: true
```

## Типичные проблемы

**`SDK location not found`** — нет `android/local.properties`. Создайте:
```
sdk.dir=C\:\\Android\\Sdk
```

**`Unsupported class file major version` / ошибки Kotlin** — Gradle запустился
на JDK 8. Проверьте `java -version` и `JAVA_HOME`; должен быть 17.

**`Failed to find Platform SDK with path: platforms;android-37`** — установлен
не тот пакет платформы. Актуальное имя — `platforms;android-37.0`.

**Metro не видит изменения** — `npx react-native start --reset-cache`.

**Видео не играет нигде** — почти наверняка потерян флаг
`RNVideo_useExoplayerHls=true` (см. раздел выше). Второй кандидат — источник
без явного MIME-типа: ExoPlayer определяет формат по расширению в пути, и
манифест Sasflix (`/api/video/{uuid}`, без `.m3u8`) без `type: 'm3u8'`
уходит в progressive-ветку и падает. Оба места закрыты в коде и описаны
в `docs/ARCHITECTURE.md`.

**Видео не запускается на конкретном устройстве** — Настройки → выключить
«Нативный плеер»: всё пойдёт через веб-плеер платформы. Плеер и сам делает
это автоматически при ошибке ExoPlayer, если у платформы есть embed.

**Непонятно, какая платформа сломалась** — Настройки → «Проверить платформы»:
экран делает живые запросы к API и показывает шаг, время и текст ошибки.
