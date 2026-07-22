import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

android {
    namespace = "com.cinnetemple.app"
    compileSdk = 36
    buildToolsVersion = "36.1.0"

    defaultConfig {
        applicationId = "com.cinnetemple.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "1.1.0"
        vectorDrawables { useSupportLibrary = true }
    }

    // Self-managed sideload signing (direct-download APK from the landing page).
    // The keystore lives OUTSIDE version control; the password alone is useless
    // without the keystore file. Keep keystore/ backed up — replacing it breaks
    // in-place updates for installed users.
    signingConfigs {
        create("release") {
            val ks = rootProject.file("keystore/release.keystore")
            if (ks.exists()) {
                storeFile = ks
                storePassword = System.getenv("CT_KEYSTORE_PASSWORD") ?: "cinnetemple-release"
                keyAlias = "cinnetemple"
                keyPassword = System.getenv("CT_KEYSTORE_PASSWORD") ?: "cinnetemple-release"
            }
        }
    }

    buildTypes {
        debug {
            // Debug points at production so the app works immediately.
            // For a local backend on the emulator switch to "http://10.0.2.2:4000".
            buildConfigField("String", "API_BASE_URL", "\"https://api.cinnetemple.com\"")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"https://api.cinnetemple.com\"")
            signingConfig = signingConfigs.getByName("release")
            // Shrinking stays off until R8 keep rules for kotlinx-serialization/
            // retrofit/media3 are curated — a working 40MB APK beats a broken 20MB one.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.browser)

    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    implementation(libs.coil.compose)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.ui)
    implementation(libs.media3.datasource.okhttp)
}
