package com.cinnetemple.app.ui.feature.admin

import com.cinnetemple.app.core.network.dto.AdminTitle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MovieEditorFormTest {

    private val loaded = AdminTitle(
        id = "m1",
        title = "Lagos Nights",
        year = 2025,
        overview = "A night in Lagos.",
        genres = listOf("Drama", "Thriller"),
        cast = listOf("Ada", "Bayo"),
        categories = listOf("trending"),
        priceMinor = 250_050,
        status = "published",
        videoKey = "videos/m1.mp4",
        posterKey = "posters/m1.jpg",
    )

    private fun loadedForm() = MovieEditorForm().apply { populate(loaded) }

    @Test fun populateFillsTheFormAndTheServerBaseline() {
        val form = loadedForm()
        assertTrue(form.populated)
        assertEquals("Lagos Nights", form.originalTitle)
        assertEquals("Drama, Thriller", form.genresText)
        assertEquals(setOf(ALWAYS_CATEGORY, "trending"), form.categories)
        assertEquals("2500.50", form.priceText)
        assertEquals("videos/m1.mp4", form.videoSlot.keyForSave)
        assertNull(form.heroSlot.keyForSave)
        assertNull(form.validationError)
        // Nothing edited: neither legacy field would be sent.
        assertNull(form.genresForPatch())
        assertNull(form.categoriesForPatch())
    }

    @Test fun createDefaultsAlwaysCarryNewListings() {
        val form = MovieEditorForm().apply { populate(null) }
        assertTrue(form.populated)
        assertEquals(setOf(ALWAYS_CATEGORY), form.categories)
        assertEquals("movie", form.type)
        assertEquals("draft", form.status)
    }

    @Test fun classificationMergeOnlyTouchesGenresAndCategories() {
        val form = loadedForm()
        form.title = "Lagos Nights (Director's Cut)"
        form.overview = "Edited overview"
        form.castText = "Ada, Bayo, Chidi"
        form.priceText = "3000"
        form.status = "draft"
        form.posterSlot.phase = UploadPhase.Verified("posters/new.jpg", 1_024)

        form.applyServerLegacy(LegacyFields.fromServer(listOf("Horror"), listOf("trending", "editors-picks")))

        assertEquals("Horror", form.genresText)
        assertEquals(setOf(ALWAYS_CATEGORY, "trending", "editors-picks"), form.categories)
        // Every other unsaved edit is still there.
        assertEquals("Lagos Nights (Director's Cut)", form.title)
        assertEquals("Edited overview", form.overview)
        assertEquals("Ada, Bayo, Chidi", form.castText)
        assertEquals("3000", form.priceText)
        assertEquals("draft", form.status)
        assertEquals("posters/new.jpg", form.posterSlot.keyForSave)
        // The fresh server state is the new baseline: the merged values are not re-sent...
        assertNull(form.genresForPatch())
        assertNull(form.categoriesForPatch())
        // ...but an edit after coming back is.
        form.genresText = "Horror, Comedy"
        assertEquals(listOf("Horror", "Comedy"), form.genresForPatch())
    }

    @Test fun localGenreEditMadeBeforeClassificationIsStillSentAfterTheMerge() {
        val form = loadedForm()
        form.genresText = "Drama, Thriller, Comedy"
        form.applyServerLegacy(LegacyFields.fromServer(listOf("Drama", "Thriller"), listOf("trending")))
        assertEquals("Drama, Thriller, Comedy", form.genresText)
        assertEquals(listOf("Drama", "Thriller", "Comedy"), form.genresForPatch())
        assertNull(form.categoriesForPatch())
    }

    @Test fun snapshotRoundTripRestoresEditsBaselineAndUploads() {
        val form = loadedForm()
        form.title = "Edited"
        form.genresText = "Drama"
        form.categories = form.categories + "acclaimed"
        form.isPremiere = true
        form.premiereText = "2026-08-01 19:30"
        form.mergedClassificationSaves = 2
        form.posterSlot.phase = UploadPhase.Verified("posters/new.jpg", 2_048)
        form.heroSlot.phase = UploadPhase.Uploading(0.4f)
        form.videoSlot.clear()

        val restored = MovieEditorForm()
        restored.restore(MovieEditorSnapshot.decode(form.snapshot().encode())!!)

        assertTrue(restored.populated)
        assertEquals("Lagos Nights", restored.originalTitle)
        assertEquals("Edited", restored.title)
        assertEquals("Drama", restored.genresText)
        assertEquals(setOf(ALWAYS_CATEGORY, "trending", "acclaimed"), restored.categories)
        assertTrue(restored.isPremiere)
        assertEquals("2026-08-01 19:30", restored.premiereText)
        assertEquals(2, restored.mergedClassificationSaves)
        assertEquals(form.server, restored.server)
        assertEquals(listOf("Drama"), restored.genresForPatch())
        assertEquals(UploadPhase.Verified("posters/new.jpg", 2_048), restored.posterSlot.phase)
        // An upload can't survive process death: it comes back as failed, not stuck "uploading".
        assertEquals(UploadPhase.Failed(UPLOAD_INTERRUPTED), restored.heroSlot.phase)
        assertFalse(restored.heroSlot.busy)
        assertNull(restored.videoSlot.keyForSave)
    }

    @Test fun corruptSnapshotDecodesToNull() {
        assertNull(MovieEditorSnapshot.decode("{not json"))
        assertFalse(MovieEditorSnapshot.decode("{}")!!.populated)
    }
}
