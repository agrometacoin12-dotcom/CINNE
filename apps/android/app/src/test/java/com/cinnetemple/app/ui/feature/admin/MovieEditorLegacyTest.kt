package com.cinnetemple.app.ui.feature.admin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Legacy genres/categories: the "changed since server state" rule and the Classification merge. */
class MovieEditorLegacyTest {

    private val base = LegacyFields.fromServer(
        genres = listOf("Drama", "Thriller"),
        categories = listOf("trending"),
    )

    // ---- LegacyFields.fromServer ----

    @Test fun fromServerAlwaysIncludesNewListingsAndTrimsGenres() {
        val fields = LegacyFields.fromServer(listOf(" Drama ", "", "Horror"), listOf("trending", "editors-picks"))
        assertEquals(listOf("Drama", "Horror"), fields.genres)
        assertEquals(setOf(ALWAYS_CATEGORY, "trending", "editors-picks"), fields.categories)
        assertEquals(setOf(ALWAYS_CATEGORY), LegacyFields.fromServer(emptyList(), emptyList()).categories)
    }

    // ---- changed-since-server-state ----

    @Test fun unchangedGenresAreNotSent() {
        assertNull(genresPatchValue("Drama, Thriller", base))
        // Only whitespace differs — same list, still omitted.
        assertNull(genresPatchValue("  Drama,Thriller , ", base))
    }

    @Test fun editedGenresAreSentInTheirNewOrder() {
        assertEquals(listOf("Thriller", "Drama"), genresPatchValue("Thriller, Drama", base))
        assertEquals(listOf("Drama"), genresPatchValue("Drama", base))
        assertEquals(emptyList<String>(), genresPatchValue("", base))
    }

    @Test fun categoriesCompareAsASet() {
        assertNull(categoriesPatchValue(setOf("trending", ALWAYS_CATEGORY), base))
        assertEquals(
            setOf(ALWAYS_CATEGORY, "trending", "acclaimed"),
            categoriesPatchValue(base.categories + "acclaimed", base)?.toSet(),
        )
        assertEquals(listOf(ALWAYS_CATEGORY), categoriesPatchValue(setOf(ALWAYS_CATEGORY), base))
    }

    // ---- merging fresh server values into the editor ----

    @Test fun untouchedFieldsAdoptTheServerValues() {
        val fresh = LegacyFields.fromServer(listOf("Horror", "Drama"), listOf("editors-picks"))
        val merged = mergeServerLegacy("Drama,Thriller", base.categories, base, fresh)
        assertEquals("Horror, Drama", merged.genresText)
        assertEquals(fresh.categories, merged.categories)
        // Against the fresh baseline nothing is pending, so a later save omits both.
        assertNull(genresPatchValue(merged.genresText, fresh))
        assertNull(categoriesPatchValue(merged.categories, fresh))
    }

    @Test fun localEditsSurviveWhenTheServerDidNotChangeThatField() {
        // Classification only touched tags etc.: legacy columns came back identical.
        val merged = mergeServerLegacy("Drama, Thriller,Comedy", base.categories + "acclaimed", base, base)
        assertEquals("Drama, Thriller,Comedy", merged.genresText) // verbatim, not reformatted
        assertEquals(base.categories + "acclaimed", merged.categories)
    }

    @Test fun localEditToOneFieldDoesNotBlockTheOtherFromUpdating() {
        val fresh = LegacyFields.fromServer(listOf("Horror"), listOf("trending", "editors-picks"))
        val merged = mergeServerLegacy("Drama, Thriller, Comedy", base.categories, base, fresh)
        assertEquals(fresh.categories, merged.categories)
        // Genres: server replaced Drama/Thriller with Horror; the local "Comedy" addition is kept.
        assertEquals("Horror, Comedy", merged.genresText)
        assertEquals(listOf("Horror", "Comedy"), genresPatchValue(merged.genresText, fresh))
    }

    @Test fun bothChangedReappliesLocalAdditionsAndRemovals() {
        // Locally: removed Thriller, added Comedy. Server: added Horror.
        val fresh = LegacyFields.fromServer(listOf("Drama", "Thriller", "Horror"), listOf("trending", "editors-picks"))
        val localCategories = base.categories - "trending" + "acclaimed"
        val merged = mergeServerLegacy("Drama, Comedy", localCategories, base, fresh)
        assertEquals("Drama, Horror, Comedy", merged.genresText)
        assertEquals(setOf(ALWAYS_CATEGORY, "editors-picks", "acclaimed"), merged.categories)
    }

    @Test fun genreMergeIsCaseInsensitiveAndKeepsTheServerSpelling() {
        val fresh = LegacyFields.fromServer(listOf("Drama", "Comedy"), listOf("trending"))
        val merged = mergeServerLegacy("Drama, Thriller, comedy", base.categories, base, fresh)
        // Thriller is gone server-side; local "comedy" duplicates the server's "Comedy".
        assertEquals("Drama, Comedy", merged.genresText)
    }

    @Test fun newListingsIsNeverMergedAway() {
        val fresh = LegacyFields.fromServer(listOf("Drama"), listOf("acclaimed"))
        val merged = mergeServerLegacy("Drama", base.categories - ALWAYS_CATEGORY + "series", base, fresh)
        assertEquals(true, ALWAYS_CATEGORY in merged.categories)
        assertEquals(setOf(ALWAYS_CATEGORY, "acclaimed", "series"), merged.categories)
    }

    // ---- mergeOrdered ----

    @Test fun mergeOrderedKeepsTheirOrderThenLocalAdditions() {
        val b = listOf("a", "b")
        assertEquals(listOf("x"), mergeOrdered(b, ours = b, theirs = listOf("x")))
        assertEquals(listOf("a", "b", "c"), mergeOrdered(b, ours = listOf("b", "a", "c"), theirs = b))
        assertEquals(listOf("b", "y", "c"), mergeOrdered(b, ours = listOf("b", "c"), theirs = listOf("a", "b", "y")))
        assertEquals(listOf("A"), mergeOrdered(emptyList(), ours = listOf("a"), theirs = listOf("A")) { it.lowercase() })
    }
}
