package com.cinnetemple.app.ui.feature.auth

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.ForgotPasswordRequest
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.SuccessBanner
import kotlinx.coroutines.launch

/**
 * Request a password-reset code by email (iOS ForgotPasswordView). The
 * endpoint always answers 200 (no account enumeration), so after sending we
 * flip to the success-banner state with an 'Enter reset code' CTA.
 */
@Composable
fun ForgotPasswordScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    val canSubmit = isValidEmail(email) && !loading

    fun submit() {
        if (!canSubmit) return
        error = null
        loading = true
        scope.launch {
            try {
                container.authApi.forgotPassword(ForgotPasswordRequest(email = email.trim()))
                sent = true
            } catch (e: Exception) {
                error = e.authMessage()
            } finally {
                loading = false
            }
        }
    }

    AuthScaffold(
        title = "Reset your password",
        subtitle = "We'll email you a code to set a new password.",
        onBack = { nav.popBackStack() },
    ) {
        error?.let { ErrorBanner(it) }

        if (!sent) {
            GlassField(
                label = "Email",
                value = email,
                onValueChange = { email = it },
                placeholder = "you@example.com",
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Done,
                ),
                enabled = !loading,
            )
            PrimaryButton(
                text = "Send reset code",
                onClick = ::submit,
                enabled = canSubmit,
                loading = loading,
            )
        } else {
            SuccessBanner(
                "If an account exists for ${email.trim()}, a reset code is on its way.",
            )
            PrimaryButton(
                text = "Enter reset code",
                onClick = { nav.navigate(Routes.resetPassword(email.trim())) },
            )
        }
    }
}
