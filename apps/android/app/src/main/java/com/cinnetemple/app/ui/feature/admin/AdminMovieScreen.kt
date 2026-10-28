package com.cinnetemple.app.ui.feature.admin

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
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.TaxonomyCollection
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.SuccessBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

// ---------------------------------------------------------------------------
// Screen — create (movieId == null) / edit (movieId != null)
// ---------------------------------------------------------------------------

/**
 * Studio movie editor. Create via POST /v1/admin/movies, edit via PATCH
 * (explicit nulls clear emptied optional fields), SAF uploads through the
 * presign -> PUT -> stat pipeline, delete with sold-ticket disclosure.
 *
 * All form state lives in [AdminMovieEditorViewModel], scoped to this
 * back-stack entry, so unsaved edits (and running uploads) survive a trip to
 * Classification. [navResults] is this entry's `savedStateHandle`, where
 * Classification reports its saves.
 */
@Composable
fun AdminMovieScreen(nav: NavController, movieId: String?, navResults: SavedStateHandle) {
    val container = LocalAppContainer.current
    val resolver = LocalContext.current.applicationContext.contentResolver
    val vm: AdminMovieEditorViewModel = viewModel(
        factory = AdminMovieEditorViewModel.factory(container.adminApi, resolver, movieId, navResults),
    )

    when {
        vm.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = CtColors.IndigoLight)
        }
        vm.loadError != null -> Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(24.dp))
            ErrorBanner(vm.loadError ?: "Could not load this movie.")
            GlassButton("Retry", onClick = { vm.load() })
            GlassButton("Go back", onClick = { nav.popBackStack() })
        }
        !vm.form.populated -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = CtColors.IndigoLight)
        }
        else -> EditorForm(nav = nav, vm = vm)
    }
}

@Composable
private fun EditorForm(nav: NavController, vm: AdminMovieEditorViewModel) {
    val form = vm.form
    val movieId = vm.movieId
    val isEdit = movieId != null

    // Which slot the SAF picker is for — saveable, since the result can arrive
    // after the activity was recreated.
    var pendingPickKind by rememberSaveable { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val kind = pendingPickKind
        pendingPickKind = null
        if (uri != null && kind != null) vm.startUpload(kind, uri)
    }

    fun pick(kind: String) {
        pendingPickKind = kind
        picker.launch(if (kind == "video") arrayOf("video/*") else arrayOf("image/*"))
    }

    var confirmDelete by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(vm.finished) {
        if (vm.finished) nav.popBackStack()
    }

    // ---- Validation ----
    val priceMinor = form.priceMinor
    val premiereIso = form.premiereIso
    val validationError = form.validationError
    val uploadsBusy = form.uploadsBusy
    val canSave = validationError == null && !uploadsBusy && !vm.saving && !vm.deleting &&
        !vm.refreshingLegacy

    // ------------------------------------------------------------------ UI
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
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
                    if (isEdit) form.originalTitle.orEmpty() else "Add a title to the catalogue",
                    color = CtColors.TextSecondary,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        vm.saveError?.let { ErrorBanner(it) }
        vm.saveSuccess?.let { SuccessBanner(it) }

        // --- Details ---
        SectionCard("Details") {
            GlassField("Title", form.title, { form.title = it }, placeholder = "e.g. Lagos Nights")
            FieldGap()
            Text("Type", color = CtColors.TextSecondary, fontSize = 13.sp)
            Spacer(Modifier.height(6.dp))
            ChoicePills(
                options = listOf("movie" to "Movie", "series" to "Series"),
                selected = form.type,
                onSelect = { form.type = it },
            )
            FieldGap()
            GlassField(
                "Year",
                form.yearText,
                { form.yearText = it },
                placeholder = "2026",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            FieldGap()
            GlassField("Tagline (optional)", form.tagline, { form.tagline = it }, placeholder = "One killer line")
            FieldGap()
            GlassField(
                "Overview",
                form.overview,
                { form.overview = it },
                placeholder = "What is this story about?",
                singleLine = false,
            )
            FieldGap()
            GlassField(
                "Genres (comma-separated)",
                form.genresText,
                { form.genresText = it },
                placeholder = "Drama, Thriller",
            )
            if (isEdit) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Top-level genre names. Pick subgenres in Classification; this field is only " +
                        "sent when you change it.",
                    color = CtColors.TextSecondary,
                    fontSize = 11.5.sp,
                )
            }
            FieldGap()
            GlassField(
                "Cast (comma-separated)",
                form.castText,
                { form.castText = it },
                placeholder = "Genevieve Nnaji, Ramsey Nouah",
            )
            FieldGap()
            GlassField("Director (optional)", form.director, { form.director = it }, placeholder = "Kemi Adetiba")
            FieldGap()
            GlassField("Maturity rating (optional)", form.maturity, { form.maturity = it }, placeholder = "PG-13")
            FieldGap()
            GlassField(
                "Runtime minutes (optional)",
                form.runtimeText,
                { form.runtimeText = it },
                placeholder = "128",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        }

        // --- Pricing ---
        SectionCard("Pricing") {
            GlassField(
                "Price in naira (₦)",
                form.priceText,
                { form.priceText = it },
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

        // --- Classification (existing titles only) ---
        if (movieId != null) {
            SectionCard("Classification") {
                Text(
                    "Format, genres & subgenres, tags, industries, languages, audience, age " +
                        "rating, availability and homepage placement.",
                    color = CtColors.TextSecondary,
                    fontSize = 11.5.sp,
                )
                Spacer(Modifier.height(10.dp))
                GlassButton(
                    "Edit classification",
                    enabled = !vm.saving && !vm.deleting,
                    onClick = { nav.navigate(Routes.adminClassification(movieId)) },
                )
                val legacyError = vm.legacyRefreshError
                when {
                    vm.refreshingLegacy -> {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Updating genres & categories from Classification…",
                            color = CtColors.TextSecondary,
                            fontSize = 11.sp,
                        )
                    }
                    legacyError != null -> {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Couldn't refresh genres & categories from Classification: $legacyError",
                            color = CtColors.SignOutText,
                            fontSize = 11.sp,
                        )
                        Spacer(Modifier.height(6.dp))
                        SmallChip("Retry", CtColors.IndigoLight) { vm.retryLegacyRefresh() }
                    }
                    form.mergedClassificationSaves > 0 -> {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Genres and categories were updated from your saved classification.",
                            color = CtColors.TextSecondary,
                            fontSize = 11.sp,
                        )
                    }
                }
            }
        }

        // --- Categories (collections from the taxonomy) ---
        SectionCard("Categories") {
            Text(
                "Rows and collections this title appears in on Browse.",
                color = CtColors.TextSecondary,
                fontSize = 11.5.sp,
            )
            Spacer(Modifier.height(4.dp))
            val options = vm.collectionOptions
            val taxonomyError = vm.taxonomyError
            when {
                options == null && taxonomyError == null -> Row(
                    Modifier.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(
                        Modifier.size(16.dp),
                        color = CtColors.IndigoLight,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Loading collections…", color = CtColors.TextSecondary, fontSize = 12.sp)
                }
                options == null -> {
                    Text(
                        "Could not load collections: ${taxonomyError.orEmpty()} — the current " +
                            "categories are kept when you save.",
                        color = CtColors.SignOutText,
                        fontSize = 11.5.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    SmallChip("Retry", CtColors.IndigoLight) { vm.loadTaxonomy() }
                }
                else -> {
                    val categories = form.categories
                    val known = options.map { it.slug }.toSet()
                    val rows = buildList {
                        if (ALWAYS_CATEGORY !in known) add(TaxonomyCollection(ALWAYS_CATEGORY, "New Listings", "SYSTEM"))
                        addAll(options.sortedBy { if (it.kind == "SYSTEM") 0 else 1 })
                        // Keep slugs the taxonomy doesn't list visible so they can be removed.
                        categories.filter { it !in known && it != ALWAYS_CATEGORY }
                            .forEach { add(TaxonomyCollection(it, it, "")) }
                    }
                    var lastKind: String? = null
                    rows.forEach { option ->
                        if (option.kind != lastKind) {
                            lastKind = option.kind
                            Spacer(Modifier.height(6.dp))
                            Text(
                                when (option.kind) {
                                    "SYSTEM" -> "Browse rows"
                                    "EDITORIAL" -> "Editorial collections"
                                    else -> "Other"
                                },
                                color = CtColors.TextSecondary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        CategoryRow(
                            label = option.name.ifBlank { option.slug },
                            checked = option.slug in categories,
                            locked = option.slug == ALWAYS_CATEGORY,
                            onToggle = {
                                form.categories = if (option.slug in form.categories) {
                                    form.categories - option.slug
                                } else {
                                    form.categories + option.slug
                                }
                            },
                        )
                    }
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
                    checked = form.isPremiere,
                    onCheckedChange = { form.isPremiere = it },
                    colors = adminSwitchColors(),
                )
            }
            if (form.isPremiere) {
                FieldGap()
                GlassField(
                    "Showtime (your local time)",
                    form.premiereText,
                    { form.premiereText = it },
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
                selected = form.status,
                onSelect = { form.status = it },
            )
            if (form.status == "published" && form.videoSlot.keyForSave == null) {
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
                slot = form.videoSlot,
                onPick = { pick("video") },
            )
            SlotDivider()
            UploadSlotRow(
                label = "Poster",
                hint = "JPG, PNG or WebP • up to 20 MB • 2:3",
                slot = form.posterSlot,
                onPick = { pick("poster") },
            )
            SlotDivider()
            UploadSlotRow(
                label = "Hero",
                hint = "JPG, PNG or WebP • up to 20 MB • wide",
                slot = form.heroSlot,
                onPick = { pick("hero") },
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
            onClick = { vm.save() },
            enabled = canSave,
            loading = vm.saving,
        )

        if (isEdit) {
            DeleteButton(
                text = if (vm.deleting) "Deleting…" else "Delete Movie",
                enabled = !vm.deleting && !vm.saving,
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
                    "“${form.originalTitle ?: "This title"}” will be permanently removed " +
                        "from the catalogue — even if tickets were sold. This cannot be undone.",
                    color = CtColors.TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    vm.delete()
                }) { Text("Delete", color = CtColors.SignOutText) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text("Cancel", color = CtColors.TextSecondary)
                }
            },
        )
    }
    vm.deletedSoldTickets?.let { sold ->
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

@Composable
private fun CategoryRow(label: String, checked: Boolean, locked: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = !locked, onClick = onToggle),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = if (locked) null else { _ -> onToggle() },
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
internal fun SmallChip(text: String, color: Color, onClick: () -> Unit) {
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
internal fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
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
internal fun FieldGap() = Spacer(Modifier.height(12.dp))

@Composable
internal fun ChoicePills(
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
// Helpers
// ---------------------------------------------------------------------------

private fun formatBytes(bytes: Long): String = when {
    bytes >= 1_073_741_824L -> String.format(Locale.US, "%.2f GB", bytes / 1_073_741_824.0)
    bytes >= 1_048_576L -> String.format(Locale.US, "%.1f MB", bytes / 1_048_576.0)
    else -> String.format(Locale.US, "%.0f KB", bytes / 1024.0)
}

/** "2026-08-01 19:30" (device-local) -> "2026-08-01T18:30:00.000Z" ISO UTC. */
internal fun parseLocalToIso(text: String): String? {
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
internal fun isoToLocalInput(iso: String?): String {
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
