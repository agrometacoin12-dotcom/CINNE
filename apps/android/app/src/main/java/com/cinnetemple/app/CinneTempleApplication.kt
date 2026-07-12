package com.cinnetemple.app

import android.app.Application
import com.cinnetemple.app.core.di.AppContainer

class CinneTempleApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
