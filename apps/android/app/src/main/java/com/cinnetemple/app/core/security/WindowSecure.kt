package com.cinnetemple.app.core.security

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext

/**
 * FLAG_SECURE helper for the watch-once player: blocks screenshots, screen
 * recording and non-secure display mirroring at the OS level (the Android
 * counterpart of iOS ScreenGuard).
 */
object WindowSecure {
    fun setSecure(activity: Activity, secure: Boolean) {
        if (secure) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}

/**
 * Drop this into any composable screen (WatchScreen, PremiereRoomScreen) to hold
 * FLAG_SECURE while it is visible and release it on dispose.
 */
@Composable
fun SecureWindowEffect(enabled: Boolean = true) {
    val context = LocalContext.current
    DisposableEffect(enabled) {
        val activity = context.findActivity()
        if (enabled && activity != null) WindowSecure.setSecure(activity, true)
        onDispose {
            if (activity != null) WindowSecure.setSecure(activity, false)
        }
    }
}

tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
