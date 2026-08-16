package com.rusvid.screen

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Регистрация [ScreenControlModule]; подключается в `MainApplication`.
 *
 * Имя модуля берётся из сгенерированного `NativeScreenControlSpec.NAME`,
 * а не дублируется строкой: оно приходит из спецификации
 * `src/specs/NativeScreenControl.ts` и должно совпадать с ней в точности.
 */
class ScreenControlPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeScreenControlSpec.NAME) ScreenControlModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        NativeScreenControlSpec.NAME to
            ReactModuleInfo(
                NativeScreenControlSpec.NAME,
                ScreenControlModule::class.java.name,
                /* canOverrideExistingModule = */ false,
                /* needsEagerInit = */ false,
                /* isCxxModule = */ false,
                /* isTurboModule = */ true,
            )
    )
  }
}
