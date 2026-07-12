package com.cinnetemple.app.ui.feature.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.ResetPasswordRequest
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * Enter the emailed reset code + a new password (iOS ResetPasswordView).
 * Success resets the auth flow back to the login screen. If the screen is
 * reached without an email argument, an email field is shown as well.
 */
@Composable
fun ResetPasswordScreen(nav: NavController, email: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    val needsEmailField = email.isBlank()
    var emailInput by remember { mutableStateOf(email) }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    val issue = passwordIssue(newPassword)
    val canSubmit = code.length >= 6 &&
        isStrongPassword(newPassword) &&
        isValidEmail(emailInput) &&
        !loading

    fun submit() {
        if (!canSubmit) return
        error = null
        loading = true
        scope.launch {
            try {
                container.authApi.resetPassword(
                    ResetPasswordRequest(
                        email = emailInput.trim(),
                        code = code,
                        newPassword = newPassword,
                    ),
                )
                // Password updated — back to login (iOS resets path to [.login]).
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
        title = "Set a new password",
        subtitle = "Enter the code we emailed you and choose a new password.",
        onBack = { nav.popBackStack() },
    ) {
        error?.let { ErrorBanner(it) }

        if (needsEmailField) {
            GlassField(
                label = "Email",
                value = emailInput,
                onValueChange = { emailInput = it },
                placeholder = "you@example.com",
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                enabled = !loading,
            )
        }

        GlassField(
            label = "Reset code",
            value = code,
            onValueChange = { input -> code = input.filter(Char::isDigit).take(10) },
            placeholder = "123456",
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Next,
            ),
            enabled = !loading,
        )

        Column {
            GlassField(
                label = "New password",
                value = newPassword,
                onValueChange = { newPassword = it },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                enabled = !loading,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = issue ?: PASSWORD_HELP,
                color = if (issue != null) CtColors.Brand else CtColors.TextSecondary,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }

        PrimaryButton(
            text = "Update password",
            onClick = ::submit,
            enabled = canSubmit,
            loading = loading,
        )
    }
}
