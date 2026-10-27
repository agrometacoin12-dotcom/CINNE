import org.jetbrains.kotlin.gradle.dsl.JvmTarget

val ctReleaseKeystore = rootProject.file("keystore/release.keystore")
val ctReleasePassword = System.getenv("CT_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() }

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
        versionCode = 3
        versionName = "1.2.0"
        vectorDrawables { useSupportLibrary = true }
    }

    // Self-managed sideload signing (direct-download APK from the landing page).
    // The keystore lives OUTSIDE version control; the password alone is useless
    // without the keystore file. Keep keystore/ backed up — replacing it breaks
    // in-place updates for installed users.
    signingConfigs {
        create("release") {
            if (ctReleaseKeystore.exists() && ctReleasePassword != null) {
                storeFile = ctReleaseKeystore
                storePassword = ctReleasePassword
                keyAlias = "cinnetemple"
                keyPassword = ctReleasePassword
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
            if (ctReleaseKeystore.exists() && ctReleasePassword != null) {
                signingConfig = signingConfigs.getByName("release")
            }
            // Shrinking stays off until R8 keep rules for kotlinx-serialization/
            // retrofit/media3 are curated — a working 40MB APK beats a broken 20MB one.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        create("iapSandbox") {
            initWith(getByName("release"))
            // Same Play package/product catalogue, isolated wallet/database.
            // License-test purchases must never mint coins in the live wallet.
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"https://iap-api-production.up.railway.app\"",
            )
            matchingFallbacks += listOf("release")
            // Local verification can use the debug key. A Play upload must use
            // the preserved release/upload key once it is present.
            signingConfig = if (ctReleaseKeystore.exists() && ctReleasePassword != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
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
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.systemProperty("robolectric.dependency.repo.url", "https://repo.maven.apache.org/maven2")
        }
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
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
    implementation(libs.google.play.billing)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    implementation(libs.coil.compose)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.ui)
    implementation(libs.media3.datasource.okhttp)
}
