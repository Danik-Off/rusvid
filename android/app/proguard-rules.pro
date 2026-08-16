# Правила R8 для release-сборки (minifyEnabled включён в build.gradle).
#
# Здесь намеренно почти пусто: keep-правила для React Native, Hermes, media3,
# OkHttp и AndroidX приезжают consumer-правилами внутри самих AAR/JAR
# (см. proguard.txt в react-android-*.aar и media3-exoplayer-*.aar).
# Дублировать их здесь — значит однажды разойтись с апстримом.
#
# Что важно знать про уже существующие правила апстрима:
#   * @DoNotStrip / @DoNotStripAny — классы и методы, которые дёргает JNI из
#     libreactnative.so и libappmodules.so, R8 их не трогает;
#   * androidx.media3.exoplayer.hls.HlsMediaSource$Factory сохраняется по имени
#     (media3-exoplayer/proguard.txt) — DefaultMediaSourceFactory грузит его
#     рефлексией. Если правило когда-нибудь исчезнет, HLS перестанет играть
#     молча, поэтому наличие класса в APK проверяет CI.

# Собственный TurboModule (ориентация экрана и системные полосы для
# полноэкранного плеера). Его методы вызываются не из Java, а из C++ через
# JNI по имени и сигнатуре — для R8 они выглядят недостижимыми, и без этого
# правила полноэкранный режим ломался бы только в release-сборке.
-keep class com.rusvid.screen.** { *; }

# Стек-трейсы из release-краша должны читаться по номерам строк.
# Имена классов при этом остаются обфусцированными — маппинг лежит в
# android/app/build/outputs/mapping/release/mapping.txt.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
