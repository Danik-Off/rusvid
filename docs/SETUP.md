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
| `npm start` | Metro-бандлер |
| `npm run android` | debug-сборка + установка на устройство/эмулятор |
| `npm run android:release` | release-сборка + установка |
| `npm run build:apk` | APK в `android/app/build/outputs/apk/release/` |
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

Собранный `app-release.apk` — около **66 МБ**: это универсальный APK со всеми
ABI (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) и без минификации.
Для реального устройства размер уменьшается втрое двумя настройками
в `android/app/build.gradle`:

```groovy
def enableProguardInReleaseBuilds = true   // минификация Java/Kotlin

android {
    splits {
        abi {
            enable true
            reset()
            include 'arm64-v8a', 'armeabi-v7a'
            universalApk false
        }
    }
}
```

Обе включены **не по умолчанию**: ProGuard требует прогонки приложения на
устройстве (правила для нативных модулей), а ABI-splits дают несколько APK
вместо одного, что менее удобно для ручной установки.

## Подпись release-сборки

По умолчанию release подписывается **отладочным** ключом из шаблона React
Native (`android/app/debug.keystore`). Такой APK устанавливается и работает,
но не годится для публикации.

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
