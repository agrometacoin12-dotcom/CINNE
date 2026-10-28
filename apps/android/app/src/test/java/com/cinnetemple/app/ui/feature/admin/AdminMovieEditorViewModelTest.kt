package com.cinnetemple.app.ui.feature.admin

import androidx.core.os.bundleOf
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.cinnetemple.app.core.network.api.AdminApi
import com.cinnetemple.app.navigation.Routes
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** The editor keeps its unsaved form across Classification and merges only genres/categories back. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = android.app.Application::class)
class AdminMovieEditorViewModelTest {
    /** Same configuration as AppContainer.json. */
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = false
    }

    private lateinit var server: MockWebServer
    private lateinit var api: AdminApi
    private val store = ViewModelStore()
    private val requests = CopyOnWriteArrayList<RecordedRequest>()

    @Volatile private var movieGenres = """["Drama","Thriller"]"""

    @Volatile private var movieCategories = """["new-listings","trending"]"""

    @Volatile private var movieTitle = "Lagos Nights"

    @Volatile private var failMovie = false

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                val path = request.path.orEmpty()
                return when {
                    path == "/v1/admin/taxonomy" -> ok(
                        """{"collections":[{"slug":"trending","name":"Trending","kind":"SYSTEM"},""" +
                            """{"slug":"editors-picks","name":"Editor's Picks","kind":"EDITORIAL"}]}""",
                    )
                    path == "/v1/admin/movies/m1" && request.method == "GET" ->
                        if (failMovie) MockResponse().setResponseCode(503) else ok(movieJson())
                    path == "/v1/admin/movies/m1" && request.method == "PATCH" -> ok(movieJson())
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
        api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(AdminApi::class.java)
    }

    @After fun tearDown() {
        store.clear()
        server.shutdown()
        Dispatchers.resetMain()
    }

    private fun ok(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    private fun movieJson() = """
        {"id":"m1","type":"movie","title":"$movieTitle","year":2025,"overview":"A night in Lagos.",
         "genres":$movieGenres,"cast":["Ada"],"categories":$movieCategories,"priceMinor":250000,
         "status":"draft","videoKey":"videos/m1.mp4"}
    """.trimIndent()

    private fun editor(
        navResults: SavedStateHandle = SavedStateHandle(),
        savedState: SavedStateHandle = SavedStateHandle(),
    ): AdminMovieEditorViewModel {
        val factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminMovieEditorViewModel(
                api,
                RuntimeEnvironment.getApplication().contentResolver,
                "m1",
                savedState,
                navResults,
            ) as T
        }
        return ViewModelProvider(store, factory)[AdminMovieEditorViewModel::class.java]
    }

    private fun waitUntil(what: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 5_000
        while (!condition()) {
            check(System.currentTimeMillis() < deadline) { "Timed out waiting for $what" }
            Thread.sleep(10)
        }
    }

    private fun movieGets() = requests.count { it.method == "GET" && it.path == "/v1/admin/movies/m1" }

    private fun AdminMovieEditorViewModel.awaitLoaded() =
        waitUntil("load") { form.populated && collectionOptions != null }

    @Test fun classificationSaveMergesOnlyGenresAndCategories() {
        val navResults = SavedStateHandle()
        val vm = editor(navResults)
        vm.awaitLoaded()
        assertEquals("Drama, Thriller", vm.form.genresText)

        // Unsaved edits, then the admin opens Classification and saves there.
        vm.form.title = "Lagos Nights (Director's Cut)"
        vm.form.priceText = "4000"
        vm.form.status = "published"
        movieTitle = "Changed elsewhere" // must NOT leak into the form
        movieGenres = """["Horror"]"""
        movieCategories = """["new-listings","trending","editors-picks"]"""
        navResults[Routes.ADMIN_CLASSIFICATION_SAVED_RESULT] = 1

        waitUntil("merge") { vm.form.mergedClassificationSaves == 1 }
        assertEquals(2, movieGets())
        assertEquals("Horror", vm.form.genresText)
        assertEquals(setOf("new-listings", "trending", "editors-picks"), vm.form.categories)
        assertEquals("Lagos Nights (Director's Cut)", vm.form.title)
        assertEquals("4000", vm.form.priceText)
        assertEquals("published", vm.form.status)
        assertNull(vm.legacyRefreshError)
        assertFalse(vm.refreshingLegacy)

        // Each further classification save is merged again; repeats of a merged count are not.
        movieGenres = """["Horror","Comedy"]"""
        navResults[Routes.ADMIN_CLASSIFICATION_SAVED_RESULT] = 2
        waitUntil("second merge") { vm.form.mergedClassificationSaves == 2 }
        assertEquals("Horror, Comedy", vm.form.genresText)
        assertEquals(3, movieGets())
    }

    @Test fun saveAfterMergeOmitsGenresAndCategoriesUntilEditedAgain() {
        val navResults = SavedStateHandle()
        val vm = editor(navResults)
        vm.awaitLoaded()
        vm.form.title = "Edited"
        movieGenres = """["Horror"]"""
        navResults[Routes.ADMIN_CLASSIFICATION_SAVED_RESULT] = 1
        waitUntil("merge") { vm.form.mergedClassificationSaves == 1 }

        vm.save()
        waitUntil("PATCH") { requests.any { it.method == "PATCH" } }
        val body = json.decodeFromString(JsonObject.serializer(), requests.first { it.method == "PATCH" }.body.readUtf8())
        assertEquals("Edited", body["title"]?.jsonPrimitive?.content)
        assertFalse("genres must be omitted", "genres" in body)
        assertFalse("categories must be omitted", "categories" in body)
        waitUntil("finish") { vm.finished }
    }

    @Test fun localGenreEditIsSentAfterMerge() {
        val navResults = SavedStateHandle()
        val vm = editor(navResults)
        vm.awaitLoaded()
        movieCategories = """["new-listings","editors-picks"]"""
        navResults[Routes.ADMIN_CLASSIFICATION_SAVED_RESULT] = 1
        waitUntil("merge") { vm.form.mergedClassificationSaves == 1 }
        vm.form.genresText = "Drama, Comedy"

        vm.save()
        waitUntil("PATCH") { requests.any { it.method == "PATCH" } }
        val body = json.decodeFromString(JsonObject.serializer(), requests.first { it.method == "PATCH" }.body.readUtf8())
        assertEquals(listOf("Drama", "Comedy"), body["genres"]?.jsonArray?.map { it.jsonPrimitive.content })
        assertFalse("categories must be omitted", "categories" in body)
    }

    @Test fun failedRefreshKeepsTheFormAndCanBeRetried() {
        val navResults = SavedStateHandle()
        val vm = editor(navResults)
        vm.awaitLoaded()
        vm.form.overview = "Edited overview"
        failMovie = true
        movieGenres = """["Horror"]"""
        navResults[Routes.ADMIN_CLASSIFICATION_SAVED_RESULT] = 1

        waitUntil("error") { vm.legacyRefreshError != null }
        assertEquals(0, vm.form.mergedClassificationSaves)
        assertEquals("Drama, Thriller", vm.form.genresText)
        assertEquals("Edited overview", vm.form.overview)

        failMovie = false
        vm.retryLegacyRefresh()
        waitUntil("retry") { vm.form.mergedClassificationSaves == 1 }
        assertNull(vm.legacyRefreshError)
        assertEquals("Horror", vm.form.genresText)
        assertEquals("Edited overview", vm.form.overview)
    }

    @Test fun restoredStateSkipsTheReloadAndKeepsEdits() {
        val previous = MovieEditorForm().apply {
            populate(null)
            title = "Unsaved title"
            genresText = "Drama"
            mergedClassificationSaves = 1
        }
        val savedState = SavedStateHandle(
            mapOf(
                AdminMovieEditorViewModel.FORM_STATE_KEY to
                    bundleOf(AdminMovieEditorViewModel.FORM_JSON to previous.snapshot().encode()),
            ),
        )
        val navResults = SavedStateHandle(mapOf(Routes.ADMIN_CLASSIFICATION_SAVED_RESULT to 1))
        val vm = editor(navResults, savedState)

        assertTrue(vm.form.populated)
        assertFalse(vm.loading)
        assertEquals("Unsaved title", vm.form.title)
        assertEquals("Drama", vm.form.genresText)
        waitUntil("taxonomy") { vm.collectionOptions != null }
        Thread.sleep(100) // give a (wrong) reload/re-merge the chance to happen
        assertEquals("no reload and no re-merge of an already merged save", 0, movieGets())
        assertNotNull(vm.collectionOptions)
    }
}
