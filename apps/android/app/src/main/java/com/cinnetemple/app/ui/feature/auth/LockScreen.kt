package com.cinnetemple.app.ui.feature.auth

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.ContextWrapper
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * Biometric lock gate (iOS LockView): shown when a session exists and the
 * biometric preference is on. Auto-prompts on entry; a successful unlock
 * restores the session (SessionStore.unlock -> /v1/auth/me), the fallback is
 * signing out.
 *
 * MainActivity is a ComponentActivity (not FragmentActivity), so the androidx
 * BiometricPrompt can't attach — we use the framework prompt on API 28+ and a
 * KeyguardManager device-credential confirmation below that.
 */
@Composable
fun LockScreen(@Suppress("UNUSED_PARAMETER") nav: NavController) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val scope = rememberCoroutineScope()

    var authenticating by remember { mutableStateOf(false) }
    var signingOut by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // API 24-27 fallback: confirm the lock-screen credential.
    val credentialLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        authenticating = false
        if (result.resultCode == Activity.RESULT_OK) {
            container.sessionStore.unlock()
        }
    }

    fun promptUnlock() {
        if (authenticating || signingOut) return
        error = null
        val act = activity ?: return
        val keyguard = act.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        val deviceSecure = keyguard.isDeviceSecure
        val biometricsAvailable = BiometricManager.from(act)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) ==
            BiometricManager.BIOMETRIC_SUCCESS

        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
                (biometricsAvailable || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && deviceSecure)) -> {
                authenticating = true
                showFrameworkBiometricPrompt(
                    activity = act,
                    allowDeviceCredential = deviceSecure,
                    onSuccess = {
                        authenticating = false
                        container.sessionStore.unlock()
                    },
                    onFailure = { message ->
                        authenticating = false
                        error = message
                    },
                )
            }
            deviceSecure -> {
                @Suppress("DEPRECATION")
                val intent = keyguard.createConfirmDeviceCredentialIntent(
                    "Unlock CinneTemple",
                    "Confirm your screen lock to continue.",
                )
                if (intent != null) {
                    authenticating = true
                    credentialLauncher.launch(intent)
                } else {
                    container.sessionStore.unlock()
                }
            }
            // No screen lock configured — there is nothing to gate with.
            else -> container.sessionStore.unlock()
        }
    }

    fun signOut() {
        if (signingOut) return
        signingOut = true
        scope.launch {
            try {
                container.sessionStore.logout()
            } finally {
                signingOut = false
            }
        }
    }

    // Auto-trigger the prompt on entry (iOS behaviour).
    LaunchedEffect(Unit) { promptUnlock() }

    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(1f))

            Icon(
                Icons.Filled.Lock,
                contentDescription = null,
                tint = CtColors.Brand,
                modifier = Modifier.size(56.dp),
            )
            Spacer(Modifier.height(18.dp))
            Text(
                "CinneTemple is locked",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Unlock with your fingerprint, face, or screen lock to continue.",
                color = CtColors.TextSecondary,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.weight(1f))

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                error?.let { ErrorBanner(it) }
                PrimaryButton(
                    text = "Unlock",
                    onClick = ::promptUnlock,
                    enabled = !authenticating && !signingOut,
                    loading = authenticating,
                )
                GlassButton(
                    text = "Sign out",
                    onClick = ::signOut,
                    enabled = !signingOut,
                )
            }
        }
    }
}

/** Walks ContextWrappers to the hosting Activity. */
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * Framework BiometricPrompt (works with ComponentActivity). Cancellation is
 * reported as onFailure(null) — the caller stays locked without a banner.
 */
@RequiresApi(Build.VERSION_CODES.P)
private fun showFrameworkBiometricPrompt(
    activity: Activity,
    allowDeviceCredential: Boolean,
    onSuccess: () -> Unit,
    onFailure: (String?) -> Unit,
) {
    val executor = ContextCompat.getMainExecutor(activity)
    val builder = BiometricPrompt.Builder(activity)
        .setTitle("Unlock CinneTemple")
        .setSubtitle("Confirm it's you to continue watching.")

    when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && allowDeviceCredential -> {
            builder.setAllowedAuthenticators(
                android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK or
                    android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && allowDeviceCredential -> {
            @Suppress("DEPRECATION")
            builder.setDeviceCredentialAllowed(true)
        }
        else -> {
            builder.setNegativeButton("Cancel", executor) { _, _ -> onFailure(null) }
        }
    }

    builder.build().authenticate(
        CancellationSignal(),
        executor,
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult?) {
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                val silentCancel = errorCode == BiometricPrompt.BIOMETRIC_ERROR_CANCELED ||
                    errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED
                onFailure(if (silentCancel) null else errString?.toString())
            }
        },
    )
}
