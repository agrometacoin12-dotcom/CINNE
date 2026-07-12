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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.RegisterRequest
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * Account creation (iOS RegisterView). Live validation mirrors the backend
 * rules — display name 2-60 chars, valid email, password 8+ with upper, lower,
 * number and symbol. The register response may include tokens (auto-verify is
 * the production default) in which case the user is logged in directly;
 * otherwise we route to the verification-code screen.
 */
@Composable
fun RegisterScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var googleLoading by remember { mutableStateOf(false) }

    val busy = loading || googleLoading
    val issue = passwordIssue(password)
    val canSubmit = name.trim().length >= 2 &&
        isValidEmail(email) &&
        isStrongPassword(password) &&
        !busy

    fun submit() {
        if (!canSubmit) return
        error = null
        loading = true
        scope.launch {
            try {
                val response = container.authApi.register(
                    RegisterRequest(
                        email = email.trim(),
                        password = password,
                        displayName = name.trim(),
                        deviceId = container.tokenStore.deviceId(),
                    ),
                )
                val tokens = response.tokens
                if (tokens != null) {
                    // Auto-verify on (production default): log straight in.
                    // Phase flips to Authenticated and the NavGraph re-routes.
                    container.sessionStore.completeLogin(tokens)
                } else {
                    // Verification enforced: collect the emailed 6-digit code.
                    nav.navigate(Routes.verifyEmail(email.trim()))
                }
            } catch (e: Exception) {
                error = e.authMessage()
            } finally {
                loading = false
            }
        }
    }

    fun googleSignIn() {
        if (busy) return
        error = null
        googleLoading = true
        scope.launch {
            error = signInWithGoogle(context, container)
            googleLoading = false
        }
    }

    AuthScaffold(
        title = "Join Cinnetemple",
        subtitle = "Create an account to start streaming",
        onBack = { nav.popBackStack() },
        footer = {
            AuthFooterLink("Already have an account?", "Sign In") {
                nav.navigate(Routes.LOGIN) {
                    popUpTo(Routes.LANDING)
                    launchSingleTop = true
                }
            }
        },
    ) {
        error?.let { ErrorBanner(it) }

        GlassField(
            label = "Name",
            value = name,
            onValueChange = { name = it },
            placeholder = "Your name",
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                imeAction = ImeAction.Next,
            ),
            enabled = !busy,
        )
        GlassField(
            label = "Email",
            value = email,
            onValueChange = { email = it },
            placeholder = "you@example.com",
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            enabled = !busy,
        )
        Column {
            GlassField(
                label = "Password",
                value = password,
                onValueChange = { password = it },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                enabled = !busy,
            )
            Spacer(Modifier.height(6.dp))
            // Footnote: the live validation issue in brand indigo when
            // invalid, else the gray helper text (iOS behaviour).
            Text(
                text = issue ?: PASSWORD_HELP,
                color = if (issue != null) CtColors.Brand else CtColors.TextSecondary,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }

        PrimaryButton(
            text = "Create Account",
            onClick = ::submit,
            enabled = canSubmit,
            loading = loading,
        )

        Column {
            OrDivider()
            Spacer(Modifier.height(16.dp))
            GoogleAuthButton(
                onClick = ::googleSignIn,
                enabled = !busy,
                loading = googleLoading,
            )
        }
    }
}
