package com.cinnetemple.app.ui.feature.admin

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.cinnetemple.app.core.network.dto.AdminTitle
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Category slugs are collection slugs from GET /v1/admin/taxonomy (SYSTEM =
 * legacy browse rows, EDITORIAL = curated). "new-listings" is ALWAYS auto-added.
 */
internal const val ALWAYS_CATEGORY = "new-listings"

// ---------------------------------------------------------------------------
// Legacy genres / categories — the Classification screen rewrites both
// ---------------------------------------------------------------------------

/**
 * The legacy `genres` (top-level genre names) and `categories` (collection
 * slugs, always including [ALWAYS_CATEGORY]) as the server last reported them.
 * A classification save rewrites both columns server-side, so the movie editor
 * rebases onto fresh values when the admin comes back from Classification.
 */
internal data class LegacyFields(
    val genres: List<String> = emptyList(),
    val categories: Set<String> = setOf(ALWAYS_CATEGORY),
) {
    companion object {
        fun fromServer(genres: List<String>, categories: List<String>) = LegacyFields(
            genres = genres.map(String::trim).filter(String::isNotEmpty),
            categories = buildSet {
                add(ALWAYS_CATEGORY)
                addAll(categories)
            },
        )
    }
}

/**
 * PATCH `genres`: the edited list, or null (= omitted) when it is unchanged
 * since the last server state, so a stale form never overwrites the genres
 * and subgenres set on the Classification screen.
 */
internal fun genresPatchValue(genresText: String, server: LegacyFields): List<String>? =
    splitCsv(genresText).takeIf { it != server.genres }

/** PATCH `categories`: same rule as [genresPatchValue]; compared as a set. */
internal fun categoriesPatchValue(categories: Set<String>, server: LegacyFields): List<String>? =
    categories.takeIf { it != server.categories }?.toList()

internal data class LegacyFormValues(val genresText: String, val categories: Set<String>)

/**
 * Rebases the editor's genres/categories onto [fresh] server values — a
 * three-way merge with [previous] (the last server state) as the base:
 * - field not edited here -> the server's new value;
 * - field edited here, server value unchanged -> the local edit, verbatim;
 * - both changed -> the server's value with the local additions/removals
 *   re-applied (genres keep the server's order, then local additions, and
 *   compare case-insensitively like the server does).
 */
internal fun mergeServerLegacy(
    genresText: String,
    categories: Set<String>,
    previous: LegacyFields,
    fresh: LegacyFields,
): LegacyFormValues {
    val localGenres = splitCsv(genresText)
    val mergedGenresText = when {
        localGenres == previous.genres -> fresh.genres.joinToString(", ")
        fresh.genres == previous.genres -> genresText
        else -> mergeOrdered(previous.genres, localGenres, fresh.genres) { it.lowercase(Locale.ROOT) }
            .joinToString(", ")
    }
    val mergedCategories = when {
        categories == previous.categories -> fresh.categories
        fresh.categories == previous.categories -> categories
        else -> fresh.categories - (previous.categories - categories) + (categories - previous.categories)
    } + ALWAYS_CATEGORY
    return LegacyFormValues(mergedGenresText, mergedCategories)
}

/**
 * Three-way list merge: [theirs] in its order minus what [ours] removed from
 * [base], then what [ours] added. Items are compared by [key]; first wins.
 */
internal fun <T> mergeOrdered(
    base: List<T>,
    ours: List<T>,
    theirs: List<T>,
    key: (T) -> Any? = { it },
): List<T> {
    val baseKeys = base.map(key).toSet()
    val removed = baseKeys - ours.map(key).toSet()
    val added = ours.filter { key(it) !in baseKeys }
    return (theirs.filter { key(it) !in removed } + added).distinctBy(key)
}

// ---------------------------------------------------------------------------
// Upload slots
// ---------------------------------------------------------------------------

internal sealed interface UploadPhase {
    data object Idle : UploadPhase

    /** [progress] < 0 = size unknown (indeterminate bar). */
    data class Uploading(val progress: Float) : UploadPhase
    data object Verifying : UploadPhase
    data class Verified(val key: String, val sizeBytes: Long) : UploadPhase
    data class Failed(val message: String) : UploadPhase
}

internal const val UPLOAD_INTERRUPTED = "Upload interrupted — choose the file again."

@Stable
internal class UploadSlotState(initialKey: String?) {
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

    /** An in-flight upload cannot outlive the process: it restores as failed. */
    fun snapshot(): UploadSlotSnapshot = when (val p = phase) {
        is UploadPhase.Verified -> UploadSlotSnapshot(existingKey, verifiedKey = p.key, verifiedSize = p.sizeBytes)
        is UploadPhase.Failed -> UploadSlotSnapshot(existingKey, failure = p.message)
        is UploadPhase.Uploading, UploadPhase.Verifying -> UploadSlotSnapshot(existingKey, failure = UPLOAD_INTERRUPTED)
        UploadPhase.Idle -> UploadSlotSnapshot(existingKey)
    }

    fun restore(snapshot: UploadSlotSnapshot) {
        existingKey = snapshot.existingKey
        phase = when {
            snapshot.verifiedKey != null -> UploadPhase.Verified(snapshot.verifiedKey, snapshot.verifiedSize)
            snapshot.failure != null -> UploadPhase.Failed(snapshot.failure)
            else -> UploadPhase.Idle
        }
    }
}

// ---------------------------------------------------------------------------
// Form state (owned by AdminMovieEditorViewModel, scoped to the editor's
// back-stack entry, so it survives opening Classification and coming back)
// ---------------------------------------------------------------------------

@Stable
internal class MovieEditorForm {
    /** True once filled from the server (edit) or with defaults (create). */
    var populated by mutableStateOf(false)
        private set

    /** The title as loaded from the server (header + delete dialog). */
    var originalTitle by mutableStateOf<String?>(null)
        private set

    // --- Details ---
    var title by mutableStateOf("")
    var type by mutableStateOf("movie")
    var yearText by mutableStateOf("")
    var tagline by mutableStateOf("")
    var overview by mutableStateOf("")
    var genresText by mutableStateOf("")
    var castText by mutableStateOf("")
    var director by mutableStateOf("")
    var maturity by mutableStateOf("")
    var runtimeText by mutableStateOf("")

    // --- Pricing (₦ major -> priceMinor kobo ×100) ---
    var priceText by mutableStateOf("")

    // --- Categories (new-listings is server-enforced, always on) ---
    var categories by mutableStateOf(setOf(ALWAYS_CATEGORY))

    // --- Premiere / status ---
    var isPremiere by mutableStateOf(false)
    var premiereText by mutableStateOf("")
    var status by mutableStateOf("draft")

    /** Legacy genres/categories as the server last reported them (the edit PATCH baseline). */
    var server by mutableStateOf(LegacyFields())
        private set

    /** Classification saves already merged in (see Routes.ADMIN_CLASSIFICATION_SAVED_RESULT). */
    var mergedClassificationSaves by mutableIntStateOf(0)

    // --- Uploads ---
    val videoSlot = UploadSlotState(null)
    val posterSlot = UploadSlotState(null)
    val heroSlot = UploadSlotState(null)
    val slots: List<UploadSlotState> get() = listOf(videoSlot, posterSlot, heroSlot)

    // --- Derived values (snapshot reads, so composition tracks them) ---
    val yearInt: Int? get() = yearText.trim().toIntOrNull()
    val priceMinor: Long? get() = parsePriceToMinor(priceText)
    val runtimeInt: Int? get() = runtimeText.trim().toIntOrNull()
    val premiereIso: String? get() = if (isPremiere) parseLocalToIso(premiereText) else null
    val uploadsBusy: Boolean get() = slots.any { it.busy }

    val validationError: String?
        get() {
            val year = yearInt
            val runtime = runtimeInt
            return when {
                title.isBlank() -> "Title is required."
                overview.isBlank() -> "Overview is required."
                year == null || year !in 1888..2100 -> "Enter a valid release year."
                priceMinor == null -> "Enter a valid price in naira (e.g. 2500 or 2500.50)."
                runtimeText.isNotBlank() && (runtime == null || runtime <= 0) ->
                    "Runtime must be a positive number of minutes."
                isPremiere && premiereIso == null ->
                    "A premiere requires a showtime — enter it as YYYY-MM-DD HH:MM."
                else -> null
            }
        }

    fun genresForPatch(): List<String>? = genresPatchValue(genresText, server)
    fun categoriesForPatch(): List<String>? = categoriesPatchValue(categories, server)

    /** Fills the form from the server ([initial]) or with create defaults (null). */
    fun populate(initial: AdminTitle?) {
        originalTitle = initial?.title
        title = initial?.title.orEmpty()
        type = initial?.type ?: "movie"
        yearText = initial?.year?.takeIf { it > 0 }?.toString().orEmpty()
        tagline = initial?.tagline.orEmpty()
        overview = initial?.overview.orEmpty()
        castText = initial?.cast?.joinToString(", ").orEmpty()
        director = initial?.director.orEmpty()
        maturity = initial?.maturityRating.orEmpty()
        runtimeText = initial?.runtimeMinutes?.toString().orEmpty()
        priceText = initial?.priceMinor?.let(::minorToMajorText).orEmpty()
        isPremiere = initial?.isPremiere ?: false
        premiereText = isoToLocalInput(initial?.premiereStartAt)
        status = initial?.status ?: "draft"
        server = LegacyFields.fromServer(initial?.genres.orEmpty(), initial?.categories.orEmpty())
        genresText = server.genres.joinToString(", ")
        categories = server.categories
        videoSlot.restore(UploadSlotSnapshot(initial?.videoKey))
        posterSlot.restore(UploadSlotSnapshot(initial?.posterKey))
        heroSlot.restore(UploadSlotSnapshot(initial?.heroKey))
        populated = true
    }

    /** Takes ONLY fresh server genres/categories; every other unsaved edit is untouched. */
    fun applyServerLegacy(fresh: LegacyFields) {
        val merged = mergeServerLegacy(genresText, categories, server, fresh)
        genresText = merged.genresText
        categories = merged.categories
        server = fresh
    }

    fun snapshot() = MovieEditorSnapshot(
        populated = populated,
        originalTitle = originalTitle,
        title = title,
        type = type,
        yearText = yearText,
        tagline = tagline,
        overview = overview,
        genresText = genresText,
        castText = castText,
        director = director,
        maturity = maturity,
        runtimeText = runtimeText,
        priceText = priceText,
        categories = categories.toList(),
        isPremiere = isPremiere,
        premiereText = premiereText,
        status = status,
        serverGenres = server.genres,
        serverCategories = server.categories.toList(),
        mergedClassificationSaves = mergedClassificationSaves,
        video = videoSlot.snapshot(),
        poster = posterSlot.snapshot(),
        hero = heroSlot.snapshot(),
    )

    fun restore(snapshot: MovieEditorSnapshot) {
        originalTitle = snapshot.originalTitle
        title = snapshot.title
        type = snapshot.type
        yearText = snapshot.yearText
        tagline = snapshot.tagline
        overview = snapshot.overview
        genresText = snapshot.genresText
        castText = snapshot.castText
        director = snapshot.director
        maturity = snapshot.maturity
        runtimeText = snapshot.runtimeText
        priceText = snapshot.priceText
        categories = snapshot.categories.toSet() + ALWAYS_CATEGORY
        isPremiere = snapshot.isPremiere
        premiereText = snapshot.premiereText
        status = snapshot.status
        server = LegacyFields(snapshot.serverGenres, snapshot.serverCategories.toSet() + ALWAYS_CATEGORY)
        mergedClassificationSaves = snapshot.mergedClassificationSaves
        videoSlot.restore(snapshot.video)
        posterSlot.restore(snapshot.poster)
        heroSlot.restore(snapshot.hero)
        populated = snapshot.populated
    }
}

// ---------------------------------------------------------------------------
// Process-death persistence (JSON string in the ViewModel's SavedStateHandle)
// ---------------------------------------------------------------------------

@Serializable
internal data class UploadSlotSnapshot(
    val existingKey: String? = null,
    val verifiedKey: String? = null,
    val verifiedSize: Long = 0,
    val failure: String? = null,
)

@Serializable
internal data class MovieEditorSnapshot(
    val populated: Boolean = false,
    val originalTitle: String? = null,
    val title: String = "",
    val type: String = "movie",
    val yearText: String = "",
    val tagline: String = "",
    val overview: String = "",
    val genresText: String = "",
    val castText: String = "",
    val director: String = "",
    val maturity: String = "",
    val runtimeText: String = "",
    val priceText: String = "",
    val categories: List<String> = listOf(ALWAYS_CATEGORY),
    val isPremiere: Boolean = false,
    val premiereText: String = "",
    val status: String = "draft",
    val serverGenres: List<String> = emptyList(),
    val serverCategories: List<String> = listOf(ALWAYS_CATEGORY),
    val mergedClassificationSaves: Int = 0,
    val video: UploadSlotSnapshot = UploadSlotSnapshot(),
    val poster: UploadSlotSnapshot = UploadSlotSnapshot(),
    val hero: UploadSlotSnapshot = UploadSlotSnapshot(),
) {
    fun encode(): String = SnapshotJson.encodeToString(serializer(), this)

    companion object {
        /** null for missing/corrupt state — the editor then reloads from the server. */
        fun decode(text: String): MovieEditorSnapshot? =
            runCatching { SnapshotJson.decodeFromString(serializer(), text) }.getOrNull()
    }
}

private val SnapshotJson = Json { ignoreUnknownKeys = true }

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

internal fun splitCsv(text: String): List<String> =
    text.split(',').map { it.trim() }.filter { it.isNotEmpty() }

/** "2500" / "2500.50" naira -> 250000 / 250050 kobo. Blank = 0 (free). Null = invalid. */
internal fun parsePriceToMinor(text: String): Long? {
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
internal fun minorToMajorText(minor: Long): String = when {
    minor <= 0L -> ""
    minor % 100L == 0L -> (minor / 100L).toString()
    else -> BigDecimal(minor).movePointLeft(2).toPlainString()
}
