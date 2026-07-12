package com.cinnetemple.app.ui.feature.auth

import android.content.Context
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.cinnetemple.app.core.di.AppContainer
import com.cinnetemple.app.core.network.dto.GoogleNativeRequest
import com.cinnetemple.app.ui.components.liquidGlass
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

sealed interface GoogleSignInResult {
    data class Success(val idToken: String) : GoogleSignInResult

    /** User dismissed the sheet — not an error, show nothing. */
    data object Cancelled : GoogleSignInResult

    data class Failed(val message: String) : GoogleSignInResult
}

/**
 * Presents the Credential Manager Google sheet and returns the ID token.
 * [context] must be an Activity context so the system UI can attach.
 */
suspend fun requestGoogleIdToken(context: Context): GoogleSignInResult {
    return try {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(com.cinnetemple.app.core.di.AppConfig.GOOGLE_SERVER_CLIENT_ID)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()
        val response = CredentialManager.create(context).getCredential(context, request)
        val credential = response.credential
        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            GoogleSignInResult.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
        } else {
            GoogleSignInResult.Failed("Unexpected credential type from Google.")
        }
    } catch (_: GetCredentialCancellationException) {
        GoogleSignInResult.Cancelled
    } catch (_: NoCredentialException) {
        GoogleSignInResult.Failed(
            "No Google account available on this device. Add one in Settings and try again.",
        )
    } catch (_: GoogleIdTokenParsingException) {
        GoogleSignInResult.Failed("Couldn't read the Google credential. Please try again.")
    } catch (e: GetCredentialException) {
        GoogleSignInResult.Failed(e.errorMessage?.toString() ?: "Google sign-in failed. Please try again.")
    }
}

/**
 * Full native Google sign-in: Credential Manager sheet -> POST
 * /v1/auth/google/native {idToken} -> SessionStore.completeLogin.
 *
 * @return an error message for the banner, or null on success/cancellation.
 */
suspend fun signInWithGoogle(context: Context, container: AppContainer): String? {
    return when (val result = requestGoogleIdToken(context)) {
        is GoogleSignInResult.Success -> try {
            val tokens = container.authApi.googleNative(GoogleNativeRequest(result.idToken))
            container.sessionStore.completeLogin(tokens)
            null
        } catch (e: Exception) {
            e.authMessage()
        }
        GoogleSignInResult.Cancelled -> null
        is GoogleSignInResult.Failed -> result.message
    }
}

/**
 * 'Continue with Google' — height-48 plain liquid glass radius 12 with a
 * G-in-circle mark (SF g.circle equivalent) + 14sp semibold white-90% label.
 */
@Composable
fun GoogleAuthButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium),
        label = "google-press",
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (enabled) 1f else 0.5f
            }
            .liquidGlass(radius = 12.dp)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled && !loading,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    Modifier
                        .size(20.dp)
                        .border(1.5.dp, Color.White.copy(alpha = 0.9f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "G",
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Text(
                    "Continue with Google",
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
