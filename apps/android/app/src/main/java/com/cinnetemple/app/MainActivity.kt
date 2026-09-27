package com.cinnetemple.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.EnterTransition
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.navigation.CinneTempleApp
import com.cinnetemple.app.ui.splash.AnimatedSplash
import com.cinnetemple.app.ui.theme.CinneTempleTheme

/** Single-activity app; all screens are Compose destinations in the NavGraph. */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Dark-only app: force dark system bars over the edge-to-edge canvas.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        val container = (application as CinneTempleApplication).container
        setContent {
            CinneTempleTheme {
                CompositionLocalProvider(LocalAppContainer provides container) {
                    // Saveable: rotation / process recreation doesn't replay the reveal.
                    var showSplash by rememberSaveable { mutableStateOf(savedInstanceState == null) }
                    Box {
                        CinneTempleApp()
                        AnimatedVisibility(
                            visible = showSplash,
                            enter = EnterTransition.None,
                            exit = fadeOut(tween(450)),
                        ) {
                            AnimatedSplash(onFinished = { showSplash = false })
                        }
                    }
                }
            }
        }
    }
}
