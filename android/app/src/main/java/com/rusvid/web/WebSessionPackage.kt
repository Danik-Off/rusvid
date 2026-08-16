package com.rusvid.web

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.rusvid.screen.NativeWebSessionSpec

/**
 * Регистрация [WebSessionModule]; подключается в `MainApplication`.
 *
 * Имя модуля берётся из сгенерированного `NativeWebSessionSpec.NAME`,
 * а не дублируется строкой: оно приходит из спецификации
 * `src/specs/NativeWebSession.ts` и должно совпадать с ней в точности.
 */
class WebSessionPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeWebSessionSpec.NAME) WebSessionModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        NativeWebSessionSpec.NAME to
            ReactModuleInfo(
                NativeWebSessionSpec.NAME,
                WebSessionModule::class.java.name,
                /* canOverrideExistingModule = */ false,
                /* needsEagerInit = */ false,
                /* isCxxModule = */ false,
                /* isTurboModule = */ true,
            )
    )
  }
}
