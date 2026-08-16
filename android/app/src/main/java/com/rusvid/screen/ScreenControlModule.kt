package com.rusvid.screen

import android.app.Activity
import android.content.pm.ActivityInfo
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowInsetsController
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil

/**
 * Ориентация экрана и системные полосы для полноэкранного плеера.
 *
 * Намеренно написан на голом framework API, без androidx: androidx.core
 * приезжает в сборку транзитивно от React Native, и полагаться на чужую
 * транзитивную зависимость в собственном модуле — это ловушка на будущее
 * обновление. Всё нужное здесь есть в самом Android.
 *
 * Модуль хранит **желаемое** состояние и умеет применять его повторно.
 * Это не перестраховка, а необходимость: Android возвращает системные полосы
 * при каждой потере фокуса окном, а фокус теряется чаще, чем кажется —
 * шторка настроек плеера, системные диалоги, «картинка в картинке», возврат
 * из фона. Одноразового `hide()` хватило бы ровно до первого такого события.
 */
class ScreenControlModule(private val reactContext: ReactApplicationContext) :
    NativeScreenControlSpec(reactContext), LifecycleEventListener {

  private var immersiveEnabled = false
  private var orientationMode = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED

  /** Слушатель фокуса окна; снимается вместе с активностью, к которой привязан. */
  private var focusListener: ViewTreeObserver.OnWindowFocusChangeListener? = null

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun setOrientation(mode: String) {
    orientationMode =
        when (mode) {
          // SENSOR_LANDSCAPE, а не LANDSCAPE: в альбомном режиме телефон можно
          // держать любой стороной, и кадр обязан следовать за рукой. Запрос
          // активности сильнее системной блокировки автоповорота — это то,
          // что нужно: пользователь нажал «на весь экран» осознанно.
          "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
          "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
          else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    onActivity { it.requestedOrientation = orientationMode }
  }

  override fun setImmersive(enabled: Boolean) {
    immersiveEnabled = enabled
    onActivity { activity ->
      if (enabled) {
        installFocusListener(activity)
      } else {
        removeFocusListener(activity)
      }
      applyImmersive(activity)
    }
  }

  /** Возврат из фона: активность могла смениться, состояние надо восстановить. */
  override fun onHostResume() {
    onActivity { activity ->
      activity.requestedOrientation = orientationMode
      if (immersiveEnabled) {
        installFocusListener(activity)
      }
      applyImmersive(activity)
    }
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() {
    onActivity { removeFocusListener(it) }
  }

  private fun applyImmersive(activity: Activity) {
    val window = activity.window ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val controller = window.insetsController ?: return
      // Порядок важен: поведение задаётся до скрытия, иначе полосы вернутся
      // по первому касанию вместо свайпа от края.
      controller.systemBarsBehavior =
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      if (immersiveEnabled) {
        controller.hide(WindowInsets.Type.systemBars())
      } else {
        controller.show(WindowInsets.Type.systemBars())
      }
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility =
          if (immersiveEnabled) {
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                LAYOUT_FLAGS
          } else {
            LAYOUT_FLAGS
          }
    }
  }

  /**
   * Пока включён полноэкранный режим, полосы возвращаются на место при каждом
   * возврате фокуса окну — например, после закрытия шторки настроек плеера,
   * которая на Android является отдельным окном.
   */
  private fun installFocusListener(activity: Activity) {
    if (focusListener != null) {
      return
    }
    val decorView = activity.window?.decorView ?: return
    val listener =
        ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
          if (hasFocus && immersiveEnabled) {
            applyImmersive(activity)
          }
        }
    decorView.viewTreeObserver.addOnWindowFocusChangeListener(listener)
    focusListener = listener
  }

  private fun removeFocusListener(activity: Activity) {
    val listener = focusListener ?: return
    focusListener = null
    val observer = activity.window?.decorView?.viewTreeObserver ?: return
    if (observer.isAlive) {
      observer.removeOnWindowFocusChangeListener(listener)
    }
  }

  /**
   * Действия над активностью выполняются в UI-потоке: вызовы прилетают из
   * JS-потока, а `requestedOrientation` и работа с окном этого не прощают.
   *
   * Если активности сейчас нет (приложение в фоне), вызов просто пропускается:
   * желаемое состояние уже сохранено в полях и будет применено в `onHostResume`.
   */
  private inline fun onActivity(crossinline block: (Activity) -> Unit) {
    // Через контекст, а не унаследованный ReactContextBaseJavaModule
    // .getCurrentActivity(): тот объявлен устаревшим с RN 0.80.
    val activity = reactContext.currentActivity ?: return
    UiThreadUtil.runOnUiThread { block(activity) }
  }

  companion object {
    /**
     * Приложение рисуется под системными полосами всегда (edge-to-edge),
     * поэтому layout-флаги остаются выставленными и после выхода из
     * полноэкранного режима — иначе на Android 10 и старше вёрстка прыгала бы.
     */
    @Suppress("DEPRECATION")
    private const val LAYOUT_FLAGS =
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
  }
}
