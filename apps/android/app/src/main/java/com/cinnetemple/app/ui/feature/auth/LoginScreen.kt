package com.cinnetemple.app.ui.feature.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.LoginRequest
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * Email/password sign-in plus native Google Sign-In (iOS LoginView,
 * Figma 42:13463). The Apple button is intentionally omitted on Android.
 */
@Composable
fun LoginScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var googleLoading by remember { mutableStateOf(false) }

    val busy = loading || googleLoading
    val canSubmit = email.isNotBlank() && password.isNotEmpty() && !busy

    fun submit() {
        if (!canSubmit) return
        error = null
        loading = true
        scope.launch {
            try {
                val tokens = container.authApi.login(
                    LoginRequest(
                        email = email.trim(),
                        password = password,
                        deviceId = container.tokenStore.deviceId(),
                    ),
                )
                // Phase flips to Authenticated; the NavGraph re-routes to Home.
                container.sessionStore.completeLogin(tokens)
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
        title = "Welcome back",
        subtitle = "Sign in to continue watching",
        onBack = { nav.popBackStack() },
        footer = {
            AuthFooterLink("Don't have an account?", "Sign Up") {
                nav.navigate(Routes.REGISTER) {
                    popUpTo(Routes.LANDING)
                    launchSingleTop = true
                }
            }
        },
    ) {
        error?.let { ErrorBanner(it) }

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

        Box(Modifier.fillMaxWidth()) {
            Text(
                "Forgot password?",
                color = CtColors.IndigoLight,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .clickable(enabled = !busy) { nav.navigate(Routes.FORGOT_PASSWORD) }
                    .padding(2.dp),
            )
        }

        PrimaryButton(
            text = "Sign In",
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
