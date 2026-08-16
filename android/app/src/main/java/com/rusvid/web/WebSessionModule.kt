package com.rusvid.web

import android.webkit.CookieManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
// Пакет сгенерированных спецификаций задаётся `codegenConfig.android
// .javaPackageName` в package.json и общий для всех модулей приложения —
// отсюда импорт из `com.rusvid.screen` в модуле, живущем в `com.rusvid.web`.
import com.rusvid.screen.NativeWebSessionSpec

/**
 * Cookie-сессии сайтов платформ.
 *
 * `android.webkit.CookieManager` — то самое общее хранилище, из которого
 * берут cookie и `WebView` экрана входа, и обычные запросы приложения
 * (OkHttp в React Native ходит в него через `ForwardingCookieHandler`).
 * Поэтому «выйти» — это погасить cookie именно здесь, а не забыть отметку
 * на своей стороне.
 */
class WebSessionModule(reactContext: ReactApplicationContext) :
    NativeWebSessionSpec(reactContext) {

  override fun clearCookies(origins: ReadableArray, promise: Promise) {
    try {
      val manager = CookieManager.getInstance()
      for (index in 0 until origins.size()) {
        origins.getString(index)?.let { expireCookies(manager, it) }
      }
      // Без flush погашённые cookie остаются на диске: следующий запуск
      // поднял бы из них ту самую сессию, из которой пользователь только
      // что вышел.
      manager.flush()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject(ERROR_CODE, error)
    }
  }

  override fun flush() {
    // Тихо: это подстраховка после входа, а не операция, о результате
    // которой пользователю есть что сказать.
    runCatching { CookieManager.getInstance().flush() }
  }

  /**
   * Точечного удаления по домену в `CookieManager` нет — есть только
   * «удалить всё». Поэтому гасим по одной: читаем cookie, выставленные для
   * origin'а, и перезаписываем каждую пустой с истёкшим сроком. Это ровно
   * то, что делает сам сайт, когда разлогинивает пользователя.
   */
  private fun expireCookies(manager: CookieManager, origin: String) {
    val raw = manager.getCookie(origin) ?: return
    val host = hostOf(origin) ?: return

    for (pair in raw.split(';')) {
      val name = pair.substringBefore('=').trim()
      if (name.isEmpty()) {
        continue
      }
      // Домен cookie заранее неизвестен: сессионные cookie платформы
      // выставлены и на сам хост, и на `.host` (чтобы их видели
      // поддомены). Гасим оба варианта — лишний вызов ничего не стоит,
      // а пропущенный оставляет пользователя внутри аккаунта.
      manager.setCookie(origin, "$name=; Max-Age=0; Path=/")
      manager.setCookie(origin, "$name=; Max-Age=0; Path=/; Domain=$host")
      manager.setCookie(origin, "$name=; Max-Age=0; Path=/; Domain=.$host")
    }
  }

  /** `https://vk.com/login` -> `vk.com`. */
  private fun hostOf(origin: String): String? =
      runCatching { java.net.URI(origin).host }.getOrNull()?.takeIf { it.isNotEmpty() }

  companion object {
    private const val ERROR_CODE = "web_session"
  }
}
