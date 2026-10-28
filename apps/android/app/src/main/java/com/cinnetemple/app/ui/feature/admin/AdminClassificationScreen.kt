package com.cinnetemple.app.ui.feature.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.AdminTaxonomy
import com.cinnetemple.app.core.network.dto.ClassificationDraft
import com.cinnetemple.app.core.network.dto.SectionPlacement
import com.cinnetemple.app.core.network.dto.TaxonomyOption
import com.cinnetemple.app.core.network.dto.TitleClassification
import com.cinnetemple.app.core.network.dto.classificationPatch
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
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private val TAG_KIND_ORDER = listOf("MOOD", "THEME", "SETTING", "CHARACTER", "STORY")
private val TAG_KIND_LABELS = mapOf(
    "MOOD" to "Mood",
    "THEME" to "Theme",
    "SETTING" to "Setting",
    "CHARACTER" to "Character",
    "STORY" to "Story",
)

/**
 * Classification editor for an EXISTING movie or series:
 * GET /v1/admin/taxonomy + GET /v1/admin/titles/{id}/classification, saved
 * with PUT (only changed fields; explicit null clears).
 */
@Composable
fun AdminClassificationScreen(nav: NavController, titleId: String) {
    val container = LocalAppContainer.current
    var taxonomy by remember { mutableStateOf<AdminTaxonomy?>(null) }
    var classification by remember { mutableStateOf<TitleClassification?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }
    /** Bumped after each successful save to reset the form to the server's answer. */
    var version by remember { mutableStateOf(0) }

    // The screen underneath (the movie editor) keeps its unsaved form; tell it
    // after a save so it re-pulls the legacy genres/categories we just mirrored.
    val callerResults = remember { nav.previousBackStackEntry?.savedStateHandle }
    val reportSave: () -> Unit = {
        callerResults?.let { handle ->
            val key = Routes.ADMIN_CLASSIFICATION_SAVED_RESULT
            handle[key] = (handle.get<Int>(key) ?: 0) + 1
        }
    }

    LaunchedEffect(titleId, reloadKey) {
        loadError = null
        try {
            coroutineScope {
                val tax = async { container.adminApi.taxonomy() }
                val cls = async { container.adminApi.classification(titleId) }
                taxonomy = tax.await()
                classification = cls.await()
            }
        } catch (e: Exception) {
            loadError = e.adminFriendlyMessage()
        }
    }

    val tax = taxonomy
    val cls = classification
    when {
        loadError != null -> Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(24.dp))
            ErrorBanner(loadError ?: "Could not load the classification.")
            GlassButton("Retry", onClick = { reloadKey++ })
            GlassButton("Go back", onClick = { nav.popBackStack() })
        }
        tax == null || cls == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = CtColors.IndigoLight)
        }
        else -> key(version) {
            ClassificationForm(
                nav = nav,
                titleId = titleId,
                taxonomy = tax,
                saved = cls,
                justSaved = version > 0,
                onSaved = {
                    classification = it
                    version++
                    reportSave()
                },
                onSaveInterrupted = reportSave,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ClassificationForm(
    nav: NavController,
    titleId: String,
    taxonomy: AdminTaxonomy,
    saved: TitleClassification,
    justSaved: Boolean,
    onSaved: (TitleClassification) -> Unit,
    /** The screen was left mid-save — the PUT may still have landed. */
    onSaveInterrupted: () -> Unit,
) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    val base = remember { ClassificationDraft.from(saved) }
    val isSeries = saved.isSeries

    // Chip-driven fields live in one draft; free-text fields keep their own text.
    var draft by remember { mutableStateOf(base) }
    var ageRatingText by remember { mutableStateOf(base.ageRating.orEmpty()) }
    var jurisdictionText by remember { mutableStateOf(base.ratingJurisdiction.orEmpty()) }
    val initialReleaseText = remember { base.releaseDate?.take(10).orEmpty() }
    var releaseText by remember { mutableStateOf(initialReleaseText) }
    val initialFromText = remember { isoToLocalInput(base.availableFrom) }
    val initialUntilText = remember { isoToLocalInput(base.availableUntil) }
    var fromText by remember { mutableStateOf(initialFromText) }
    var untilText by remember { mutableStateOf(initialUntilText) }
    var countriesText by remember { mutableStateOf(base.productionCountries.joinToString(", ")) }
    var expandedGenres by remember {
        mutableStateOf(
            taxonomy.genres.filter { g -> g.subgenres.any { it.slug in base.genres } }.map { it.slug }.toSet(),
        )
    }

    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var saveSuccess by remember {
        mutableStateOf(if (justSaved) "Classification saved. Placement updated below." else null)
    }

    // ---- Parse free-text fields (unchanged text keeps the server's exact value) ----
    val releaseDate = when {
        releaseText.isBlank() -> null
        releaseText == initialReleaseText -> base.releaseDate
        else -> releaseText.trim().takeIf(::isValidReleaseDate)
    }
    val availableFrom = when {
        fromText.isBlank() -> null
        fromText == initialFromText -> base.availableFrom
        else -> parseLocalToIso(fromText)
    }
    val availableUntil = when {
        untilText.isBlank() -> null
        untilText == initialUntilText -> base.availableUntil
        else -> parseLocalToIso(untilText)
    }
    val countries = parseCodeList(countriesText).map { it.uppercase(Locale.US) }
    val badCountries = countries.filterNot { it.matches(Regex("[A-Z]{2}")) }

    val validationError = when {
        releaseText.isNotBlank() && releaseDate == null -> "Release date must be YYYY-MM-DD."
        fromText.isNotBlank() && availableFrom == null -> "Available from must be YYYY-MM-DD HH:MM."
        untilText.isNotBlank() && availableUntil == null -> "Available until must be YYYY-MM-DD HH:MM."
        badCountries.isNotEmpty() ->
            "Production countries must be 2-letter ISO codes (${badCountries.joinToString(", ")})."
        else -> null
    }

    val edited = draft.copy(
        ageRating = ageRatingText.trim().ifBlank { null },
        ratingJurisdiction = jurisdictionText.trim().ifBlank { null },
        releaseDate = releaseDate,
        availableFrom = availableFrom,
        availableUntil = availableUntil,
        productionCountries = countries.distinct(),
    )
    val patch = classificationPatch(base, edited, isSeries)
    val canSave = validationError == null && patch.isNotEmpty() && !saving

    fun save() {
        saveError = null
        saveSuccess = null
        saving = true
        scope.launch {
            try {
                val result = container.adminApi.updateClassification(titleId, patch)
                onSaved(result)
            } catch (e: CancellationException) {
                onSaveInterrupted()
                throw e
            } catch (e: Exception) {
                saveError = e.adminFriendlyMessage()
                saving = false
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(0.dp))
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
                Text("Classification", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text(
                    (if (isSeries) "Series" else "Movie") + " • " +
                        labelFor(taxonomy.formats, saved.effectiveFormat),
                    color = CtColors.TextSecondary,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        saveError?.let { ErrorBanner(it) }
        saveSuccess?.let { SuccessBanner(it) }

        // --- Format ---
        SectionCard("Content format") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ToggleChip(
                    "Default (${labelFor(taxonomy.formats, defaultFormat(isSeries))})",
                    selected = draft.contentFormat == null,
                ) { draft = draft.copy(contentFormat = null) }
                taxonomy.formats.forEach { option ->
                    ToggleChip(option.label, selected = draft.contentFormat == option.value) {
                        draft = draft.copy(contentFormat = option.value)
                    }
                }
            }
        }

        // --- Genres ---
        SectionCard("Genres") {
            Hint("Selection order is kept — the first genre leads. Tap a genre's arrow for subgenres.")
            if (draft.genres.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Selected: " + draft.genres.joinToString(", ") { slug -> genreName(taxonomy, slug) },
                    color = CtColors.IndigoLight,
                    fontSize = 11.5.sp,
                )
            }
            taxonomy.genres.forEach { genre ->
                val expanded = genre.slug in expandedGenres
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ToggleChip(genre.name, selected = genre.slug in draft.genres) {
                        draft = draft.copy(genres = toggleOrdered(draft.genres, genre.slug))
                    }
                    if (genre.subgenres.isNotEmpty()) {
                        Spacer(Modifier.width(8.dp))
                        val count = genre.subgenres.count { it.slug in draft.genres }
                        Text(
                            (if (expanded) "▾ " else "▸ ") +
                                "${genre.subgenres.size} subgenres" + if (count > 0) " ($count)" else "",
                            color = CtColors.TextSecondary,
                            fontSize = 11.sp,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable {
                                    expandedGenres = if (expanded) expandedGenres - genre.slug else expandedGenres + genre.slug
                                }
                                .padding(horizontal = 6.dp, vertical = 4.dp),
                        )
                    }
                }
                if (expanded) {
                    Spacer(Modifier.height(6.dp))
                    FlowRow(
                        Modifier.padding(start = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        genre.subgenres.forEach { sub ->
                            ToggleChip(sub.name, selected = sub.slug in draft.genres, small = true) {
                                draft = draft.copy(genres = toggleOrdered(draft.genres, sub.slug))
                            }
                        }
                    }
                }
            }
        }

        // --- Tags ---
        SectionCard("Tags") {
            val byKind = taxonomy.tags.groupBy { it.kind }
            val kinds = TAG_KIND_ORDER.filter { it in byKind } + byKind.keys.filter { it !in TAG_KIND_ORDER }
            kinds.forEachIndexed { index, kind ->
                if (index > 0) Spacer(Modifier.height(10.dp))
                GroupLabel(TAG_KIND_LABELS[kind] ?: kind)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    byKind[kind].orEmpty().forEach { tag ->
                        ToggleChip(tag.name, selected = tag.slug in draft.tags, small = true) {
                            draft = draft.copy(tags = toggleOrdered(draft.tags, tag.slug))
                        }
                    }
                }
            }
        }

        // --- Industries ---
        SectionCard("Industries") {
            val auto = saved.industries.filter { it.isAuto }
            Hint("AUTO industries come from production countries and original languages and are recomputed on every save.")
            Spacer(Modifier.height(6.dp))
            val autoSlugs = auto.map { it.slug }.toSet()
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                auto.forEach { industry ->
                    ToggleChip("🔒 ${industry.name} • AUTO", selected = true, enabled = false, small = true) {}
                }
                taxonomy.industries.filter { it.slug !in autoSlugs }.forEach { industry ->
                    ToggleChip(industry.name, selected = industry.slug in draft.industries, small = true) {
                        draft = draft.copy(industries = toggleOrdered(draft.industries, industry.slug))
                    }
                }
            }
        }

        // --- Countries & languages ---
        SectionCard("Countries & languages") {
            GlassField(
                "Production countries (ISO codes, comma-separated)",
                countriesText,
                { countriesText = it },
                placeholder = "NG, GH",
            )
            FieldGap()
            LanguagePicker(
                label = "Original languages",
                options = taxonomy.languages.map { it.code to it.name },
                selected = draft.originalLanguages,
                onChange = { draft = draft.copy(originalLanguages = it) },
            )
            FieldGap()
            LanguagePicker(
                label = "Audio languages",
                options = taxonomy.languages.map { it.code to it.name },
                selected = draft.audioLanguages,
                onChange = { draft = draft.copy(audioLanguages = it) },
            )
        }

        // --- Audience & rating ---
        SectionCard("Audience & age rating") {
            GroupLabel("Audience")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ToggleChip("Not set", selected = draft.audience == null) { draft = draft.copy(audience = null) }
                taxonomy.audiences.forEach { option ->
                    ToggleChip(option.label, selected = draft.audience == option.value) {
                        draft = draft.copy(audience = option.value)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Hint("Audience is a browse hint only — it never sets the certified age rating.")
            FieldGap()
            GlassField("Certified age rating", ageRatingText, { ageRatingText = it }, placeholder = "e.g. 18, PG-13")
            FieldGap()
            GlassField(
                "Rating jurisdiction",
                jurisdictionText,
                { jurisdictionText = it },
                placeholder = "e.g. NFVCB (Nigeria), MPA (US)",
            )
            Spacer(Modifier.height(6.dp))
            Hint("The rating and the board/country that issued it are stored separately.")
        }

        // --- Release & access ---
        SectionCard("Release & access") {
            GlassField("Release date", releaseText, { releaseText = it }, placeholder = "YYYY-MM-DD")
            Spacer(Modifier.height(6.dp))
            Hint("Empty = 1 January of the title's year.")
            FieldGap()
            GroupLabel("Access type")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ToggleChip("Default (from price)", selected = draft.accessType == null) {
                    draft = draft.copy(accessType = null)
                }
                taxonomy.accessTypes.forEach { option ->
                    ToggleChip(option.label, selected = draft.accessType == option.value) {
                        draft = draft.copy(accessType = option.value)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "Classification only: checkout still charges the ticket price once. " +
                    "Currently effective: ${labelFor(taxonomy.accessTypes, saved.effectiveAccess)}.",
                color = AdminAmber,
                fontSize = 11.sp,
            )
        }

        // --- Availability ---
        SectionCard("Availability window") {
            GlassField("Available from (your local time)", fromText, { fromText = it }, placeholder = "YYYY-MM-DD HH:MM")
            FieldGap()
            GlassField("Available until (your local time)", untilText, { untilText = it }, placeholder = "YYYY-MM-DD HH:MM")
            Spacer(Modifier.height(6.dp))
            Hint("Leave empty for no limit. Outside the window the title is hidden from homepage rows.")
            if (isSeries) {
                FieldGap()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Series complete", color = Color.White, fontSize = 14.sp)
                        Hint("No more episodes are expected.")
                    }
                    Switch(
                        checked = draft.seriesComplete,
                        onCheckedChange = { draft = draft.copy(seriesComplete = it) },
                        colors = adminSwitchColors(),
                    )
                }
            }
        }

        // --- Editorial collections ---
        SectionCard("Editorial collections") {
            val editorial = taxonomy.collections.filter { it.kind == "EDITORIAL" }
            val editorialSlugs = editorial.map { it.slug }.toSet()
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                editorial.forEach { collection ->
                    ToggleChip(collection.name, selected = collection.slug in draft.collections, small = true) {
                        draft = draft.copy(collections = toggleOrdered(draft.collections, collection.slug))
                    }
                }
            }
            val others = draft.collections.filter { it !in editorialSlugs }
            if (others.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Hint(
                    "Browse rows (edit them in the movie editor's Categories): " +
                        others.joinToString(", ") { slug ->
                            taxonomy.collections.firstOrNull { it.slug == slug }?.name ?: slug
                        },
                )
            }
        }

        // --- Placement preview ---
        SectionCard("Homepage placement preview") {
            Hint("Sections whose rules match the last saved classification.")
            Spacer(Modifier.height(8.dp))
            if (saved.placement.isEmpty()) {
                Text("No homepage section matches yet.", color = CtColors.TextSecondary, fontSize = 12.sp)
            }
            saved.placement.forEach { PlacementRow(it) }
            Spacer(Modifier.height(8.dp))
            Text(
                "Actual placement requires publication and eligibility checks.",
                color = AdminAmber,
                fontSize = 11.sp,
            )
        }

        validationError?.let { Text(it, color = CtColors.SignOutText, fontSize = 12.sp) }
        if (validationError == null && patch.isEmpty()) {
            Text("No changes to save.", color = CtColors.TextSecondary, fontSize = 12.sp)
        }
        PrimaryButton(
            text = "Save Classification",
            onClick = { save() },
            enabled = canSave,
            loading = saving,
        )
        Spacer(Modifier.height(24.dp))
    }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

@Composable
private fun Hint(text: String) {
    Text(text, color = CtColors.TextSecondary, fontSize = 11.5.sp)
}

@Composable
private fun GroupLabel(text: String) {
    Text(text, color = CtColors.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(6.dp))
}

@Composable
private fun ToggleChip(
    label: String,
    selected: Boolean,
    enabled: Boolean = true,
    small: Boolean = false,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(10.dp)
    val color = if (selected) CtColors.Brand else Color.White
    Text(
        label,
        color = when {
            !enabled -> CtColors.TextSecondary
            selected -> Color.White
            else -> CtColors.TextSecondary
        },
        fontSize = if (small) 11.5.sp else 12.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        maxLines = 1,
        modifier = Modifier
            .clip(shape)
            .background(color.copy(alpha = if (selected) 0.35f else 0.04f))
            .border(1.dp, color.copy(alpha = if (selected) 0.6f else 0.12f), shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = if (small) 10.dp else 12.dp, vertical = if (small) 6.dp else 8.dp),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LanguagePicker(
    label: String,
    options: List<Pair<String, String>>,
    selected: List<String>,
    onChange: (List<String>) -> Unit,
) {
    var extra by remember { mutableStateOf("") }
    val known = options.map { it.first }.toSet()
    GroupLabel(label)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (code, name) ->
            ToggleChip(name, selected = code in selected, small = true) { onChange(toggleOrdered(selected, code)) }
        }
        selected.filter { it !in known }.forEach { code ->
            ToggleChip("$code ✕", selected = true, small = true) { onChange(selected - code) }
        }
    }
    Spacer(Modifier.height(8.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        GlassField("Other code", extra, { extra = it }, modifier = Modifier.weight(1f), placeholder = "e.g. efi")
        Spacer(Modifier.width(8.dp))
        val code = extra.trim().lowercase(Locale.US)
        val valid = isValidLanguageCode(code)
        SmallChip("Add", if (valid) CtColors.IndigoLight else CtColors.TextSecondary) {
            if (valid) {
                if (code !in selected) onChange(selected + code)
                extra = ""
            }
        }
    }
}

@Composable
private fun PlacementRow(placement: SectionPlacement) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(placement.title.ifBlank { placement.slug }, color = Color.White, fontSize = 13.sp)
            placement.reason?.takeIf { !placement.eligible && it.isNotBlank() }?.let {
                Text(it, color = AdminAmber, fontSize = 11.sp)
            }
        }
        Spacer(Modifier.width(8.dp))
        val color = if (placement.eligible) AdminGreen else AdminAmber
        Text(
            if (placement.eligible) "Eligible" else "Not eligible",
            color = color,
            fontSize = 10.5.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(color.copy(alpha = 0.12f))
                .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Adds [value] at the end (selection order) or removes it. */
internal fun toggleOrdered(list: List<String>, value: String): List<String> =
    if (value in list) list - value else list + value

/** "NG, gh  US" -> ["NG","gh","US"] (commas or whitespace; blanks dropped; distinct). */
internal fun parseCodeList(text: String): List<String> =
    text.split(',', ' ', '\n', '\t').map { it.trim() }.filter { it.isNotEmpty() }.distinct()

/** The server accepts any 2–3 letter lower-case code. */
internal fun isValidLanguageCode(code: String): Boolean = code.matches(Regex("[a-z]{2,3}"))

/** Strict YYYY-MM-DD (rejects 2026-02-30). */
internal fun isValidReleaseDate(text: String): Boolean {
    if (!text.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) return false
    return try {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }.parse(text) != null
    } catch (_: ParseException) {
        false
    }
}

private fun defaultFormat(isSeries: Boolean) = if (isSeries) "TV_SERIES" else "FEATURE_FILM"

private fun labelFor(options: List<TaxonomyOption>, value: String): String =
    options.firstOrNull { it.value == value }?.label ?: value.ifBlank { "—" }

private fun genreName(taxonomy: AdminTaxonomy, slug: String): String {
    taxonomy.genres.forEach { genre ->
        if (genre.slug == slug) return genre.name
        genre.subgenres.firstOrNull { it.slug == slug }?.let { return "${genre.name} › ${it.name}" }
    }
    return slug
}
