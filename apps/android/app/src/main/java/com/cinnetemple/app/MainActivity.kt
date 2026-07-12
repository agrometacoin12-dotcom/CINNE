package com.cinnetemple.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.navigation.CinneTempleApp
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
                    CinneTempleApp()
                }
            }
        }
    }
}
