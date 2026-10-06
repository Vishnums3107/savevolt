package com.savevolt

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Exposes the Android 12+ exact-alarm permission to JavaScript.
 *
 * react-native-push-notification schedules reminders with AlarmManager.setExact*, which throws a
 * SecurityException on Android 12+ when the app may not schedule exact alarms. The JS layer checks
 * this before scheduling so reminders never crash the app.
 */
class ExactAlarmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.resolve(true)
      return
    }
    try {
      val alarmManager =
          reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      promise.resolve(alarmManager.canScheduleExactAlarms())
    } catch (error: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.resolve(false)
      return
    }
    try {
      val intent =
          Intent(
              Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
              Uri.parse("package:${reactApplicationContext.packageName}"),
          )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.resolve(false)
    }
  }

  companion object {
    const val NAME = "SaveVoltAlarms"
  }
}
