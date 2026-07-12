package com.cinnetemple.app.ui.feature.admin

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.AdminTitle
import com.cinnetemple.app.core.network.dto.CreateMovieRequest
import com.cinnetemple.app.core.network.dto.PresignRequest
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.SuccessBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import java.io.IOException
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okio.BufferedSink

// ---------------------------------------------------------------------------
// Constants — mirror the backend contracts exactly
// ---------------------------------------------------------------------------

/** Browse-row slugs (fixed server-side order). "new-listings" is ALWAYS auto-added. */
private val CATEGORY_OPTIONS = listOf(
    "new-listings" to "New Listings",
    "trending" to "Trending",
    "most-watched" to "Most Watched",
    "coming-soon" to "Coming Soon",
    "new-releases" to "New Releases",
    "acclaimed" to "Acclaimed",
    "series" to "Series",
)

/** Presign allowlists — POST /v1/admin/uploads/presign rejects anything else. */
private val VIDEO_TYPES = setOf("video/mp4", "video/quicktime", "video/webm")
private val IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp")

/** PATCH nullable-clearable fields get explicit JSON nulls when emptied. */
private sealed interface UploadPhase {
    data object Idle : UploadPhase

    /** [progress] < 0 = size unknown (indeterminate bar). */
    data class Uploading(val progress: Float) : UploadPhase
    data object Verifying : UploadPhase
    data class Verified(val key: String, val sizeBytes: Long) : UploadPhase
    data class Failed(val message: String) : UploadPhase
}

@Stable
private class UploadSlotState(initialKey: String?) {
    /** Key already attached to the movie server-side (edit mode). */
    var existingKey by mutableStateOf(initialKey)
    var phase by mutableStateOf<UploadPhase>(UploadPhase.Idle)

    /** What save() should send: freshly verified key wins, else the existing one. */
    val keyForSave: String?
        get() = (phase as? UploadPhase.Verified)?.key ?: existingKey

    val busy: Boolean
        get() = phase is UploadPhase.Uploading || phase is UploadPhase.Verifying

    fun clear() {
        existingKey = null
        phase = UploadPhase.Idle
    }
}

// ---------------------------------------------------------------------------
// Screen — create (movieId == null) / edit (movieId != null)
// ---------------------------------------------------------------------------

/**
 * Studio movie editor. Create via POST /v1/admin/movies, edit via PATCH
 * (explicit nulls clear emptied optional fields), SAF uploads through the
 * presign -> PUT -> stat pipeline, delete with sold-ticket disclosure.
 */
@Composable
fun AdminMovieScreen(nav: NavController, movieId: String?) {
    val container = LocalAppContainer.current
    var initial by remember { mutableStateOf<AdminTitle?>(null) }
    var loading by remember { mutableStateOf(movieId != null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(movieId, reloadKey) {
        if (movieId == null) return@LaunchedEffect
        loading = true
        loadError = null
        try {
            initial = container.adminApi.movie(movieId)
        } catch (e: Exception) {
            loadError = e.adminFriendlyMessage()
        }
        loading = false
    }

    when {
        loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = CtColors.IndigoLight)
        }
        loadError != null -> Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(24.dp))
            ErrorBanner(loadError ?: "Could not load this movie.")
            GlassButton("Retry", onClick = { reloadKey++ })
            GlassButton("Go back", onClick = { nav.popBackStack() })
        }
        else -> EditorForm(nav = nav, movieId = movieId, initial = initial)
    }
}

@Composable
private fun EditorForm(nav: NavController, movieId: String?, initial: AdminTitle?) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val isEdit = movieId != null

    // --- Details ---
    var title by remember { mutableStateOf(initial?.title.orEmpty()) }
    var type by remember { mutableStateOf(initial?.type ?: "movie") }
    var yearText by remember { mutableStateOf(initial?.year?.takeIf { it > 0 }?.toString().orEmpty()) }
    var tagline by remember { mutableStateOf(initial?.tagline.orEmpty()) }
    var overview by remember { mutableStateOf(initial?.overview.orEmpty()) }
    var genresText by remember { mutableStateOf(initial?.genres?.joinToString(", ").orEmpty()) }
    var castText by remember { mutableStateOf(initial?.cast?.joinToString(", ").orEmpty()) }
    var director by remember { mutableStateOf(initial?.director.orEmpty()) }
    var maturity by remember { mutableStateOf(initial?.maturityRating.orEmpty()) }
    var runtimeText by remember { mutableStateOf(initial?.runtimeMinutes?.toString().orEmpty()) }

    // --- Pricing (₦ major -> priceMinor kobo ×100) ---
    var priceText by remember { mutableStateOf(initial?.priceMinor?.let(::minorToMajorText).orEmpty()) }

    // --- Categories (new-listings is server-enforced, always on) ---
    var categories by remember {
        mutableStateOf(
            buildSet {
                add("new-listings")
                initial?.categories?.forEach(::add)
            },
        )
    }

    // --- Premiere / status ---
    var isPremiere by remember { mutableStateOf(initial?.isPremiere ?: false) }
    var premiereText by remember { mutableStateOf(isoToLocalInput(initial?.premiereStartAt)) }
    var status by remember { mutableStateOf(initial?.status ?: "draft") }

    // --- Uploads ---
    val videoSlot = remember { UploadSlotState(initial?.videoKey) }
    val posterSlot = remember { UploadSlotState(initial?.posterKey) }
    val heroSlot = remember { UploadSlotState(initial?.heroKey) }
    val slots = listOf(videoSlot, posterSlot, heroSlot)

    // --- Save / delete ---
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var saveSuccess by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var deletedSoldTickets by remember { mutableStateOf<Int?>(null) }

    // ---- Upload pipeline: presign -> streaming PUT (exact Content-Type) -> stat ----
    fun startUpload(kind: String, slot: UploadSlotState, uri: Uri) {
        scope.launch {
            val resolver = context.contentResolver
            val contentType = resolveContentType(resolver, uri)
            val allowed = if (kind == "video") VIDEO_TYPES else IMAGE_TYPES
            if (contentType == null || contentType !in allowed) {
                slot.phase = UploadPhase.Failed(
                    if (kind == "video") {
                        "Unsupported video type${contentType?.let { " ($it)" }.orEmpty()} — use MP4, MOV or WebM."
                    } else {
                        "Unsupported image type${contentType?.let { " ($it)" }.orEmpty()} — use JPG, PNG or WebP."
                    },
                )
                return@launch
            }
            slot.phase = UploadPhase.Uploading(-1f)
            try {
                val presign = container.adminApi.presignUpload(PresignRequest(kind, contentType))
                if (!presign.enabled || presign.uploadUrl.isBlank()) {
                    throw IOException("Uploads are disabled on the server.")
                }
                // Content-Type is inside the HMAC — send EXACTLY what was presigned.
                val exactType = presign.headers["Content-Type"] ?: contentType
                val size = queryFileSize(resolver, uri)
                var lastShown = 0f
                val body = ContentUriRequestBody(resolver, uri, exactType.toMediaType(), size) { p ->
                    if (p >= 1f || p - lastShown >= 0.01f) {
                        lastShown = p
                        slot.phase = UploadPhase.Uploading(p.coerceIn(0f, 1f))
                    }
                }
                container.adminApi.uploadMedia(presign.uploadUrl, body)
                slot.phase = UploadPhase.Verifying
                val stat = container.adminApi.uploadStat(presign.key)
                if (!stat.exists || stat.size <= 0L) {
                    throw IOException("Upload could not be verified — please try again.")
                }
                slot.phase = UploadPhase.Verified(presign.key, stat.size)
            } catch (e: Exception) {
                slot.phase = UploadPhase.Failed(e.adminFriendlyMessage())
            }
        }
    }

    var pendingPick by remember { mutableStateOf<Pair<String, UploadSlotState>?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val pending = pendingPick
        pendingPick = null
        if (uri != null && pending != null) startUpload(pending.first, pending.second, uri)
    }

    fun pick(kind: String, slot: UploadSlotState) {
        pendingPick = kind to slot
        picker.launch(if (kind == "video") arrayOf("video/*") else arrayOf("image/*"))
    }

    // ---- Validation ----
    val yearInt = yearText.trim().toIntOrNull()
    val priceMinor = parsePriceToMinor(priceText)
    val runtimeInt = runtimeText.trim().toIntOrNull()
    val premiereIso = if (isPremiere) parseLocalToIso(premiereText) else null
    val validationError = when {
        title.isBlank() -> "Title is required."
        overview.isBlank() -> "Overview is required."
        yearInt == null || yearInt !in 1888..2100 -> "Enter a valid release year."
        priceMinor == null -> "Enter a valid price in naira (e.g. 2500 or 2500.50)."
        runtimeText.isNotBlank() && (runtimeInt == null || runtimeInt <= 0) ->
            "Runtime must be a positive number of minutes."
        isPremiere && premiereIso == null ->
            "A premiere requires a showtime — enter it as YYYY-MM-DD HH:MM."
        else -> null
    }
    val uploadsBusy = slots.any { it.busy }
    val canSave = validationError == null && !uploadsBusy && !saving && !deleting

    // ---- Save (POST create / PATCH edit with explicit-null clears) ----
    fun save() {
        val year = yearInt ?: return
        val price = priceMinor ?: return
        saveError = null
        saveSuccess = null
        saving = true
        scope.launch {
            try {
                if (movieId == null) {
                    container.adminApi.createMovie(
                        CreateMovieRequest(
                            title = title.trim(),
                            overview = overview.trim(),
                            year = year,
                            type = type,
                            tagline = tagline.trim().ifBlank { null },
                            genres = splitCsv(genresText),
                            cast = splitCsv(castText),
                            director = director.trim().ifBlank { null },
                            categories = categories.toList(),
                            maturityRating = maturity.trim().ifBlank { null },
                            runtimeMinutes = runtimeInt,
                            priceMinor = price,
                            currency = "NGN",
                            posterKey = posterSlot.keyForSave,
                            heroKey = heroSlot.keyForSave,
                            videoKey = videoSlot.keyForSave,
                            status = status,
                            isPremiere = isPremiere,
                            premiereStartAt = premiereIso,
                        ),
                    )
                } else {
                    container.adminApi.updateMovieRaw(
                        movieId,
                        buildPatchBody(
                            title = title,
                            type = type,
                            year = year,
                            tagline = tagline,
                            overview = overview,
                            genres = splitCsv(genresText),
                            cast = splitCsv(castText),
                            director = director,
                            categories = categories.toList(),
                            maturity = maturity,
                            runtimeMinutes = runtimeInt,
                            priceMinor = price,
                            videoKey = videoSlot.keyForSave,
                            posterKey = posterSlot.keyForSave,
                            heroKey = heroSlot.keyForSave,
                            status = status,
                            isPremiere = isPremiere,
                            premiereIso = premiereIso,
                        ),
                    )
                }
                saveSuccess = if (movieId == null) "Movie created." else "Changes saved."
                delay(700)
                nav.popBackStack()
            } catch (e: Exception) {
                saveError = e.adminFriendlyMessage()
                saving = false
            }
        }
    }

    fun delete() {
        val id = movieId ?: return
        deleting = true
        saveError = null
        scope.launch {
            try {
                val result = container.adminApi.deleteMovie(id)
                deletedSoldTickets = result.soldTickets
            } catch (e: Exception) {
                saveError = e.adminFriendlyMessage()
            }
            deleting = false
        }
    }

    // ------------------------------------------------------------------ UI
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(0.dp)) // first spacedBy gap -> 14dp top breathing room
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).liquidGlass(radius = 20.dp).clickable { nav.popBackStack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (isEdit) "Edit Movie" else "New Movie",
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    if (isEdit) initial?.title.orEmpty() else "Add a title to the catalogue",
                    color = CtColors.TextSecondary,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        saveError?.let { ErrorBanner(it) }
        saveSuccess?.let { SuccessBanner(it) }

        // --- Details ---
        SectionCard("Details") {
            GlassField("Title", title, { title = it }, placeholder = "e.g. Lagos Nights")
            FieldGap()
            Text("Type", color = CtColors.TextSecondary, fontSize = 13.sp)
            Spacer(Modifier.height(6.dp))
            ChoicePills(
                options = listOf("movie" to "Movie", "series" to "Series"),
                selected = type,
                onSelect = { type = it },
            )
            FieldGap()
            GlassField(
                "Year",
                yearText,
                { yearText = it },
                placeholder = "2026",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            FieldGap()
            GlassField("Tagline (optional)", tagline, { tagline = it }, placeholder = "One killer line")
            FieldGap()
            GlassField(
                "Overview",
                overview,
                { overview = it },
                placeholder = "What is this story about?",
                singleLine = false,
            )
            FieldGap()
            GlassField(
                "Genres (comma-separated)",
                genresText,
                { genresText = it },
                placeholder = "Drama, Thriller",
            )
            FieldGap()
            GlassField(
                "Cast (comma-separated)",
                castText,
                { castText = it },
                placeholder = "Genevieve Nnaji, Ramsey Nouah",
            )
            FieldGap()
            GlassField("Director (optional)", director, { director = it }, placeholder = "Kemi Adetiba")
            FieldGap()
            GlassField("Maturity rating (optional)", maturity, { maturity = it }, placeholder = "PG-13")
            FieldGap()
            GlassField(
                "Runtime minutes (optional)",
                runtimeText,
                { runtimeText = it },
                placeholder = "128",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        }

        // --- Pricing ---
        SectionCard("Pricing") {
            GlassField(
                "Price in naira (₦)",
                priceText,
                { priceText = it },
                placeholder = "2500",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                when {
                    priceMinor == null -> "Enter a valid amount — stored as kobo (×100)."
                    priceMinor <= 0L -> "Free — a ticket is granted instantly, no checkout."
                    else -> "${Money.formatMinor(priceMinor)} • stored as $priceMinor kobo"
                },
                color = if (priceMinor == null) CtColors.SignOutText else CtColors.TextSecondary,
                fontSize = 11.5.sp,
            )
        }

        // --- Categories ---
        SectionCard("Categories") {
            Text(
                "Rows this title appears in on Browse.",
                color = CtColors.TextSecondary,
                fontSize = 11.5.sp,
            )
            Spacer(Modifier.height(4.dp))
            CATEGORY_OPTIONS.forEach { (slug, label) ->
                val locked = slug == "new-listings"
                val checked = slug in categories
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(enabled = !locked) {
                            categories = if (checked) categories - slug else categories + slug
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = checked,
                        onCheckedChange = if (locked) {
                            null
                        } else {
                            { categories = if (checked) categories - slug else categories + slug }
                        },
                        enabled = !locked,
                        colors = CheckboxDefaults.colors(
                            checkedColor = CtColors.Brand,
                            uncheckedColor = Color.White.copy(alpha = 0.35f),
                            checkmarkColor = Color.White,
                            disabledCheckedColor = CtColors.Brand.copy(alpha = 0.55f),
                        ),
                    )
                    Text(
                        if (locked) "$label (always included)" else label,
                        color = if (locked) CtColors.TextSecondary else Color.White,
                        fontSize = 13.sp,
                    )
                }
            }
        }

        // --- Premiere ---
        SectionCard("Premiere") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Scheduled premiere", color = Color.White, fontSize = 14.sp)
                    Text(
                        "Ticketed live event with chat at showtime.",
                        color = CtColors.TextSecondary,
                        fontSize = 11.5.sp,
                    )
                }
                Switch(
                    checked = isPremiere,
                    onCheckedChange = { isPremiere = it },
                    colors = adminSwitchColors(),
                )
            }
            if (isPremiere) {
                FieldGap()
                GlassField(
                    "Showtime (your local time)",
                    premiereText,
                    { premiereText = it },
                    placeholder = "2026-08-01 19:30",
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    premiereIso?.let { "Will premiere at $it (UTC)" }
                        ?: "Required — format YYYY-MM-DD HH:MM.",
                    color = if (premiereIso == null) CtColors.SignOutText else CtColors.TextSecondary,
                    fontSize = 11.5.sp,
                )
            }
        }

        // --- Status ---
        SectionCard("Status") {
            ChoicePills(
                options = listOf("draft" to "Draft", "published" to "Published"),
                selected = status,
                onSelect = { status = it },
            )
            if (status == "published" && videoSlot.keyForSave == null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "No video attached — viewers will see this title but can't play it yet.",
                    color = AdminAmber,
                    fontSize = 11.5.sp,
                )
            }
        }

        // --- Uploads ---
        SectionCard("Media uploads") {
            UploadSlotRow(
                label = "Video",
                hint = "MP4, MOV or WebM • up to 8 GB",
                slot = videoSlot,
                onPick = { pick("video", videoSlot) },
            )
            SlotDivider()
            UploadSlotRow(
                label = "Poster",
                hint = "JPG, PNG or WebP • up to 20 MB • 2:3",
                slot = posterSlot,
                onPick = { pick("poster", posterSlot) },
            )
            SlotDivider()
            UploadSlotRow(
                label = "Hero",
                hint = "JPG, PNG or WebP • up to 20 MB • wide",
                slot = heroSlot,
                onPick = { pick("hero", heroSlot) },
            )
        }

        validationError?.let {
            Text(it, color = CtColors.SignOutText, fontSize = 12.sp)
        }
        if (uploadsBusy) {
            Text(
                "Waiting for uploads to finish and verify…",
                color = CtColors.TextSecondary,
                fontSize = 12.sp,
            )
        }
        PrimaryButton(
            text = if (isEdit) "Save Changes" else "Create Movie",
            onClick = { save() },
            enabled = canSave,
            loading = saving,
        )

        if (isEdit) {
            DeleteButton(
                text = if (deleting) "Deleting…" else "Delete Movie",
                enabled = !deleting && !saving,
                onClick = { confirmDelete = true },
            )
        }
        Spacer(Modifier.height(24.dp))
    }

    // --- Delete confirm + sold-tickets disclosure ---
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = CtColors.BgSurface,
            title = { Text("Delete movie?", color = Color.White) },
            text = {
                Text(
                    "“${initial?.title ?: "This title"}” will be permanently removed " +
                        "from the catalogue — even if tickets were sold. This cannot be undone.",
                    color = CtColors.TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    delete()
                }) { Text("Delete", color = CtColors.SignOutText) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text("Cancel", color = CtColors.TextSecondary)
                }
            },
        )
    }
    deletedSoldTickets?.let { sold ->
        AlertDialog(
            onDismissRequest = {},
            containerColor = CtColors.BgSurface,
            title = { Text("Movie deleted", color = Color.White) },
            text = {
                Text(
                    if (sold == 0) {
                        "No tickets had been sold for this title."
                    } else {
                        "$sold sold ticket${if (sold == 1) "" else "s"} were attached to this " +
                            "title — they remain in the sales history."
                    },
                    color = CtColors.TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = { nav.popBackStack() }) {
                    Text("Done", color = CtColors.IndigoLight)
                }
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Upload slot UI
// ---------------------------------------------------------------------------

@Composable
private fun UploadSlotRow(
    label: String,
    hint: String,
    slot: UploadSlotState,
    onPick: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(hint, color = CtColors.TextSecondary, fontSize = 10.5.sp)
            }
            Spacer(Modifier.width(8.dp))
            when (slot.phase) {
                is UploadPhase.Uploading, UploadPhase.Verifying -> {
                    CircularProgressIndicator(
                        Modifier.size(18.dp),
                        color = CtColors.IndigoLight,
                        strokeWidth = 2.dp,
                    )
                }
                else -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (slot.keyForSave != null) {
                            SmallChip("Remove", CtColors.SignOutText) { slot.clear() }
                        }
                        SmallChip(
                            if (slot.keyForSave != null) "Replace" else "Choose file",
                            CtColors.IndigoLight,
                            onPick,
                        )
                    }
                }
            }
        }
        when (val phase = slot.phase) {
            is UploadPhase.Uploading -> {
                Spacer(Modifier.height(8.dp))
                if (phase.progress < 0f) {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth().height(4.dp),
                        color = CtColors.IndigoLight,
                        trackColor = CtColors.Track,
                    )
                } else {
                    LinearProgressIndicator(
                        progress = { phase.progress },
                        modifier = Modifier.fillMaxWidth().height(4.dp),
                        color = CtColors.IndigoLight,
                        trackColor = CtColors.Track,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Uploading… ${(phase.progress * 100).toInt()}%",
                        color = CtColors.TextSecondary,
                        fontSize = 10.5.sp,
                    )
                }
            }
            UploadPhase.Verifying -> {
                Spacer(Modifier.height(6.dp))
                Text("Verifying upload…", color = CtColors.TextSecondary, fontSize = 10.5.sp)
            }
            is UploadPhase.Verified -> {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Verified ${formatBytes(phase.sizeBytes)} ✓",
                    color = AdminGreen,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            is UploadPhase.Failed -> {
                Spacer(Modifier.height(6.dp))
                Text(phase.message, color = CtColors.SignOutText, fontSize = 11.sp)
            }
            UploadPhase.Idle -> {
                slot.existingKey?.let { key ->
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Attached: ${key.substringAfterLast('/')}",
                        color = CtColors.TextSecondary,
                        fontSize = 10.5.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun SmallChip(text: String, color: Color, onClick: () -> Unit) {
    Text(
        text,
        color = color,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.12f))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
private fun SlotDivider() {
    Spacer(Modifier.height(10.dp))
    Box(Modifier.fillMaxWidth().height(1.dp).background(CtColors.Hairline))
    Spacer(Modifier.height(10.dp))
}

// ---------------------------------------------------------------------------
// Small form building blocks
// ---------------------------------------------------------------------------

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .padding(16.dp),
    ) {
        Text(title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(12.dp))
        content()
    }
}

@Composable
private fun FieldGap() = Spacer(Modifier.height(12.dp))

@Composable
private fun ChoicePills(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (value, label) ->
            val active = value == selected
            Box(
                Modifier
                    .height(32.dp)
                    .let {
                        if (active) {
                            it.liquidGlass(radius = 10.dp, tint = CtColors.Brand, elevation = 0.dp)
                        } else {
                            it
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color.White.copy(alpha = 0.04f))
                        }
                    }
                    .clickable { onSelect(value) }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    color = if (active) Color.White else CtColors.TextSecondary,
                    fontSize = 12.sp,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
    }
}

/** iOS sign-out style destructive button: #F2555A text on #BF1515 8% / 25% border. */
@Composable
private fun DeleteButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .height(52.dp)
            .background(CtColors.SignOutBase.copy(alpha = 0.08f), shape)
            .border(1.dp, CtColors.SignOutBase.copy(alpha = 0.25f), shape)
            .clip(shape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = CtColors.SignOutText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ---------------------------------------------------------------------------
// PATCH body — explicit JSON nulls clear emptied optional fields
// ---------------------------------------------------------------------------

private fun buildPatchBody(
    title: String,
    type: String,
    year: Int,
    tagline: String,
    overview: String,
    genres: List<String>,
    cast: List<String>,
    director: String,
    categories: List<String>,
    maturity: String,
    runtimeMinutes: Int?,
    priceMinor: Long,
    videoKey: String?,
    posterKey: String?,
    heroKey: String?,
    status: String,
    isPremiere: Boolean,
    premiereIso: String?,
): JsonObject = buildJsonObject {
    put("title", title.trim())
    put("type", type)
    put("year", year)
    put("overview", overview.trim())
    // Nullable-clearable fields: kotlinx `put` encodes a null String as JsonNull.
    put("tagline", tagline.trim().ifBlank { null })
    put("director", director.trim().ifBlank { null })
    put("maturityRating", maturity.trim().ifBlank { null })
    putJsonArray("genres") { genres.forEach { add(it) } }
    putJsonArray("cast") { cast.forEach { add(it) } }
    putJsonArray("categories") { categories.forEach { add(it) } }
    // runtimeMinutes is NOT in the nullable-clear list — omit when blank.
    runtimeMinutes?.let { put("runtimeMinutes", it) }
    put("priceMinor", priceMinor)
    put("currency", "NGN")
    put("videoKey", videoKey)
    put("posterKey", posterKey)
    put("heroKey", heroKey)
    put("status", status)
    put("isPremiere", isPremiere)
    // isPremiere:false auto-clears server-side; explicit null keeps it unambiguous.
    put("premiereStartAt", if (isPremiere) premiereIso else null)
}

// ---------------------------------------------------------------------------
// Streaming upload body (SAF content Uri -> single PUT, no chunking)
// ---------------------------------------------------------------------------

private class ContentUriRequestBody(
    private val resolver: ContentResolver,
    private val uri: Uri,
    private val mediaType: MediaType,
    private val length: Long,
    private val onProgress: (Float) -> Unit,
) : RequestBody() {
    override fun contentType(): MediaType = mediaType

    override fun contentLength(): Long = length

    /** The stream can't be replayed — never let OkHttp retry with a drained body. */
    override fun isOneShot(): Boolean = true

    override fun writeTo(sink: BufferedSink) {
        val input = resolver.openInputStream(uri)
            ?: throw IOException("Could not open the selected file.")
        input.use { stream ->
            val buffer = ByteArray(256 * 1024)
            var sent = 0L
            while (true) {
                val read = stream.read(buffer)
                if (read == -1) break
                sink.write(buffer, 0, read)
                sent += read
                if (length > 0) onProgress(sent.toFloat() / length.toFloat())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

private fun splitCsv(text: String): List<String> =
    text.split(',').map { it.trim() }.filter { it.isNotEmpty() }

/** "2500" / "2500.50" naira -> 250000 / 250050 kobo. Blank = 0 (free). Null = invalid. */
private fun parsePriceToMinor(text: String): Long? {
    val trimmed = text.trim().replace("₦", "").replace(",", "")
    if (trimmed.isEmpty()) return 0L
    return try {
        val minor = BigDecimal(trimmed).movePointRight(2).setScale(0, RoundingMode.HALF_UP)
        val value = minor.longValueExact()
        if (value < 0) null else value
    } catch (_: NumberFormatException) {
        null
    } catch (_: ArithmeticException) {
        null
    }
}

/** priceMinor 250050 -> "2500.50"; 250000 -> "2500" (for prefilling the ₦ field). */
private fun minorToMajorText(minor: Long): String = when {
    minor <= 0L -> ""
    minor % 100L == 0L -> (minor / 100L).toString()
    else -> BigDecimal(minor).movePointLeft(2).toPlainString()
}

private fun resolveContentType(resolver: ContentResolver, uri: Uri): String? {
    resolver.getType(uri)?.let { if (it != "application/octet-stream") return it }
    val ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString()).lowercase(Locale.US)
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
}

/** -1 when the provider doesn't report a size (upload falls back to indeterminate). */
private fun queryFileSize(resolver: ContentResolver, uri: Uri): Long {
    resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (index >= 0 && cursor.moveToFirst() && !cursor.isNull(index)) {
            return cursor.getLong(index)
        }
    }
    return -1L
}

private fun formatBytes(bytes: Long): String = when {
    bytes >= 1_073_741_824L -> String.format(Locale.US, "%.2f GB", bytes / 1_073_741_824.0)
    bytes >= 1_048_576L -> String.format(Locale.US, "%.1f MB", bytes / 1_048_576.0)
    else -> String.format(Locale.US, "%.0f KB", bytes / 1024.0)
}

/** "2026-08-01 19:30" (device-local) -> "2026-08-01T18:30:00.000Z" ISO UTC. */
private fun parseLocalToIso(text: String): String? {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return null
    val parser = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { isLenient = false }
    val date = try {
        parser.parse(trimmed)
    } catch (_: ParseException) {
        null
    } ?: return null
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(date)
}

private val ISO_INPUT_PATTERNS = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    "yyyy-MM-dd'T'HH:mm:ss",
)

/** ISO UTC -> "yyyy-MM-dd HH:mm" in the device timezone (for prefilling the field). */
private fun isoToLocalInput(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    for (pattern in ISO_INPUT_PATTERNS) {
        try {
            val parser = SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val date = parser.parse(iso) ?: continue
            return SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(date)
        } catch (_: ParseException) {
            // try the next pattern
        }
    }
    return ""
}
