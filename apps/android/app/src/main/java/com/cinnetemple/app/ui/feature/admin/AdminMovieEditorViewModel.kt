package com.cinnetemple.app.ui.feature.admin

import android.content.ContentResolver
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.os.bundleOf
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.cinnetemple.app.core.network.api.AdminApi
import com.cinnetemple.app.core.network.dto.CreateMovieRequest
import com.cinnetemple.app.core.network.dto.PresignRequest
import com.cinnetemple.app.core.network.dto.TaxonomyCollection
import com.cinnetemple.app.navigation.Routes
import java.io.IOException
import java.util.Locale
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okio.BufferedSink

/** Presign allowlists — POST /v1/admin/uploads/presign rejects anything else. */
private val VIDEO_TYPES = setOf("video/mp4", "video/quicktime", "video/webm")
private val IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp")

/**
 * State + work of the movie editor, scoped to its back-stack entry: the form,
 * running uploads and the loaded title survive opening Classification (and
 * configuration changes); the form also survives process death through
 * [SavedStateHandle].
 *
 * [navResults] is the editor entry's own `savedStateHandle`. Classification
 * bumps [Routes.ADMIN_CLASSIFICATION_SAVED_RESULT] there after each save; the
 * editor then re-fetches the title and merges ONLY the legacy genres/categories
 * that classification mirrors, keeping every other unsaved edit.
 */
internal class AdminMovieEditorViewModel(
    private val adminApi: AdminApi,
    private val resolver: ContentResolver,
    val movieId: String?,
    savedState: SavedStateHandle,
    private val navResults: SavedStateHandle,
) : ViewModel() {

    val form = MovieEditorForm()

    var loading by mutableStateOf(false)
        private set
    var loadError by mutableStateOf<String?>(null)
        private set

    /** Collection choices come from the taxonomy (no hard-coded slugs). */
    var collectionOptions by mutableStateOf<List<TaxonomyCollection>?>(null)
        private set
    var taxonomyError by mutableStateOf<String?>(null)
        private set

    var saving by mutableStateOf(false)
        private set
    var saveError by mutableStateOf<String?>(null)
        private set
    var saveSuccess by mutableStateOf<String?>(null)
        private set

    /** Set shortly after a successful save; the screen then pops itself. */
    var finished by mutableStateOf(false)
        private set
    var deleting by mutableStateOf(false)
        private set
    var deletedSoldTickets by mutableStateOf<Int?>(null)
        private set

    /** Re-fetching genres/categories after a Classification save. */
    var refreshingLegacy by mutableStateOf(false)
        private set
    var legacyRefreshError by mutableStateOf<String?>(null)
        private set
    private val legacyMutex = Mutex()

    init {
        savedState.get<Bundle>(FORM_STATE_KEY)?.getString(FORM_JSON)
            ?.let(MovieEditorSnapshot::decode)
            ?.takeIf { it.populated }
            ?.let(form::restore)
        savedState.setSavedStateProvider(FORM_STATE_KEY) { bundleOf(FORM_JSON to form.snapshot().encode()) }
        when {
            form.populated -> Unit
            movieId == null -> form.populate(null)
            else -> load()
        }
        loadTaxonomy()
        viewModelScope.launch {
            navResults.getStateFlow(Routes.ADMIN_CLASSIFICATION_SAVED_RESULT, 0)
                .collect { saves -> syncLegacyFromServer(saves) }
        }
    }

    fun load() {
        val id = movieId ?: return
        loading = true
        loadError = null
        viewModelScope.launch {
            try {
                form.populate(adminApi.movie(id))
                // A fresh load already reflects every classification save so far.
                form.mergedClassificationSaves = classificationSaves()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                loadError = e.adminFriendlyMessage()
            }
            loading = false
        }
    }

    fun loadTaxonomy() {
        taxonomyError = null
        viewModelScope.launch {
            try {
                collectionOptions = adminApi.taxonomy().collections
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                taxonomyError = e.adminFriendlyMessage()
            }
        }
    }

    // ---- Classification -> legacy genres/categories ----

    fun retryLegacyRefresh() {
        viewModelScope.launch { syncLegacyFromServer(classificationSaves()) }
    }

    private fun classificationSaves(): Int = navResults[Routes.ADMIN_CLASSIFICATION_SAVED_RESULT] ?: 0

    private suspend fun syncLegacyFromServer(saves: Int) = legacyMutex.withLock {
        val id = movieId ?: return@withLock
        // Not loaded yet: the pending load returns the post-save values anyway.
        if (!form.populated || saves <= form.mergedClassificationSaves) return@withLock
        refreshingLegacy = true
        legacyRefreshError = null
        try {
            val fresh = adminApi.movie(id)
            form.applyServerLegacy(LegacyFields.fromServer(fresh.genres, fresh.categories))
            form.mergedClassificationSaves = saves
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            legacyRefreshError = e.adminFriendlyMessage()
        } finally {
            refreshingLegacy = false
        }
    }

    // ---- Upload pipeline: presign -> streaming PUT (exact Content-Type) -> stat ----

    fun slotFor(kind: String): UploadSlotState = when (kind) {
        "video" -> form.videoSlot
        "poster" -> form.posterSlot
        else -> form.heroSlot
    }

    /** Runs in [viewModelScope], so it keeps going while Classification is open. */
    fun startUpload(kind: String, uri: Uri) {
        val slot = slotFor(kind)
        viewModelScope.launch {
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
                val presign = adminApi.presignUpload(PresignRequest(kind, contentType))
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
                adminApi.uploadMedia(presign.uploadUrl, body)
                slot.phase = UploadPhase.Verifying
                val stat = adminApi.uploadStat(presign.key)
                if (!stat.exists || stat.size <= 0L) {
                    throw IOException("Upload could not be verified — please try again.")
                }
                slot.phase = UploadPhase.Verified(presign.key, stat.size)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                slot.phase = UploadPhase.Failed(e.adminFriendlyMessage())
            }
        }
    }

    // ---- Save (POST create / PATCH edit with explicit-null clears) ----

    fun save() {
        val year = form.yearInt ?: return
        val price = form.priceMinor ?: return
        if (form.validationError != null || form.uploadsBusy || saving || deleting || refreshingLegacy) return
        saveError = null
        saveSuccess = null
        saving = true
        viewModelScope.launch {
            try {
                if (movieId == null) {
                    adminApi.createMovie(
                        CreateMovieRequest(
                            title = form.title.trim(),
                            overview = form.overview.trim(),
                            year = year,
                            type = form.type,
                            tagline = form.tagline.trim().ifBlank { null },
                            genres = splitCsv(form.genresText),
                            cast = splitCsv(form.castText),
                            director = form.director.trim().ifBlank { null },
                            categories = form.categories.toList(),
                            maturityRating = form.maturity.trim().ifBlank { null },
                            runtimeMinutes = form.runtimeInt,
                            priceMinor = price,
                            currency = "NGN",
                            posterKey = form.posterSlot.keyForSave,
                            heroKey = form.heroSlot.keyForSave,
                            videoKey = form.videoSlot.keyForSave,
                            status = form.status,
                            isPremiere = form.isPremiere,
                            premiereStartAt = form.premiereIso,
                        ),
                    )
                } else {
                    adminApi.updateMovieRaw(
                        movieId,
                        buildPatchBody(
                            title = form.title,
                            type = form.type,
                            year = year,
                            tagline = form.tagline,
                            overview = form.overview,
                            // Only when changed since the last server state, so a stale
                            // form never overwrites what Classification saved.
                            genres = form.genresForPatch(),
                            cast = splitCsv(form.castText),
                            director = form.director,
                            categories = form.categoriesForPatch(),
                            maturity = form.maturity,
                            runtimeMinutes = form.runtimeInt,
                            priceMinor = price,
                            videoKey = form.videoSlot.keyForSave,
                            posterKey = form.posterSlot.keyForSave,
                            heroKey = form.heroSlot.keyForSave,
                            status = form.status,
                            isPremiere = form.isPremiere,
                            premiereIso = form.premiereIso,
                        ),
                    )
                }
                saveSuccess = if (movieId == null) "Movie created." else "Changes saved."
                delay(700)
                finished = true
            } catch (e: CancellationException) {
                throw e
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
        viewModelScope.launch {
            try {
                deletedSoldTickets = adminApi.deleteMovie(id).soldTickets
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                saveError = e.adminFriendlyMessage()
            }
            deleting = false
        }
    }

    companion object {
        internal const val FORM_STATE_KEY = "movieEditorForm"
        internal const val FORM_JSON = "json"

        fun factory(
            adminApi: AdminApi,
            resolver: ContentResolver,
            movieId: String?,
            navResults: SavedStateHandle,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                AdminMovieEditorViewModel(adminApi, resolver, movieId, createSavedStateHandle(), navResults)
            }
        }
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
    genres: List<String>?,
    cast: List<String>,
    director: String,
    categories: List<String>?,
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
    // null = unchanged -> omitted (legacy sync would otherwise replace classification rows).
    genres?.let { list -> putJsonArray("genres") { list.forEach { add(it) } } }
    putJsonArray("cast") { cast.forEach { add(it) } }
    categories?.let { list -> putJsonArray("categories") { list.forEach { add(it) } } }
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
