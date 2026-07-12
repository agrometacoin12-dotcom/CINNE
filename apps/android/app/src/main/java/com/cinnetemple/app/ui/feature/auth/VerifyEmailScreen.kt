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
import com.cinnetemple.app.core.network.dto.VerifyEmailRequest
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import kotlinx.coroutines.launch

/**
 * 6-digit email verification code entry after registration (iOS
 * VerifyEmailView). Success resets the auth flow back to the login screen.
 */
@Composable
fun VerifyEmailScreen(nav: NavController, email: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    val canSubmit = code.length >= 6 && !loading

    fun submit() {
        if (!canSubmit) return
        error = null
        loading = true
        scope.launch {
            try {
                container.authApi.verifyEmail(VerifyEmailRequest(email = email, code = code))
                // Verified — back to login (iOS resets the path to [.login]).
                nav.navigate(Routes.LOGIN) {
                    popUpTo(Routes.LANDING)
                    launchSingleTop = true
                }
            } catch (e: Exception) {
                error = e.authMessage()
            } finally {
                loading = false
            }
        }
    }

    AuthScaffold(
        title = "Verify your email",
        subtitle = "We sent a 6-digit code to ${email.ifBlank { "your email" }}.",
        onBack = { nav.popBackStack() },
    ) {
        error?.let { ErrorBanner(it) }

        GlassField(
            label = "Verification code",
            value = code,
            onValueChange = { input -> code = input.filter(Char::isDigit).take(10) },
            placeholder = "123456",
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Done,
            ),
            enabled = !loading,
        )

        PrimaryButton(
            text = "Verify and continue",
            onClick = ::submit,
            enabled = canSubmit,
            loading = loading,
        )
    }
}
