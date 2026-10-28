package com.cinnetemple.app.core.network

import com.cinnetemple.app.core.network.dto.AdminTaxonomy
import com.cinnetemple.app.core.network.dto.ClassificationDraft
import com.cinnetemple.app.core.network.dto.TitleClassification
import com.cinnetemple.app.core.network.dto.classificationPatch
import com.cinnetemple.app.ui.feature.admin.isValidLanguageCode
import com.cinnetemple.app.ui.feature.admin.isValidReleaseDate
import com.cinnetemple.app.ui.feature.admin.parseCodeList
import com.cinnetemple.app.ui.feature.admin.toggleOrdered
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.*
import org.junit.Test

class ClassificationDtosTest {
    /** Same configuration as AppContainer.json. */
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = false
    }

    private val taxonomyJson = """
        {
          "genres": [{"slug":"horror","name":"Horror","subgenres":[{"slug":"horror-psychological","name":"Psychological"}]}],
          "tags": [{"slug":"village","name":"Village","kind":"SETTING"},{"slug":"dark","name":"Dark","kind":"MOOD"}],
          "industries": [{"slug":"nollywood","name":"Nollywood"}],
          "collections": [{"slug":"editors-picks","name":"Editor's Picks","kind":"EDITORIAL"},{"slug":"trending","name":"Trending","kind":"SYSTEM"}],
          "formats": [{"value":"FEATURE_FILM","label":"Feature Film"}],
          "audiences": [{"value":"ADULTS","label":"Adults"}],
          "accessTypes": [{"value":"RENTAL","label":"Rental"}],
          "languages": [{"code":"yo","name":"Yoruba"}],
          "decades": ["2020s"],
          "somethingNew": true
        }
    """.trimIndent()

    private val classificationJson = """
        {
          "titleId": "t1", "type": "series",
          "contentFormat": null, "effectiveFormat": "TV_SERIES",
          "genres": ["horror-psychological","horror"], "tags": ["village"], "collections": ["editors-picks","new-listings"],
          "industries": [{"slug":"nollywood","name":"Nollywood","source":"auto"},{"slug":"yoruba-cinema","name":"Yoruba Cinema","source":"manual"}],
          "audience": "ADULTS", "ageRating": "18", "ratingJurisdiction": "NFVCB",
          "releaseDate": "2026-05-01", "accessType": null, "effectiveAccess": "PAY_PER_VIEW",
          "productionCountries": ["NG"], "originalLanguages": ["yo"], "audioLanguages": ["yo","en"],
          "availableFrom": null, "availableUntil": "2027-01-01T00:00:00.000Z", "seriesComplete": false,
          "placement": [
            {"slug":"village-stories","title":"Village Stories","eligible":true},
            {"slug":"horror","title":"Horror","eligible":false,"reason":"Not published"}
          ]
        }
    """.trimIndent()

    private fun saved() = json.decodeFromString<TitleClassification>(classificationJson)

    @Test fun decodesTheTaxonomyShape() {
        val tax = json.decodeFromString<AdminTaxonomy>(taxonomyJson)
        assertEquals("horror-psychological", tax.genres.single().subgenres.single().slug)
        assertEquals(listOf("SETTING", "MOOD"), tax.tags.map { it.kind })
        assertEquals("nollywood", tax.industries.single().slug)
        assertEquals("EDITORIAL", tax.collections.first().kind)
        assertEquals("Feature Film", tax.formats.single().label)
        assertEquals("ADULTS", tax.audiences.single().value)
        assertEquals("RENTAL", tax.accessTypes.single().value)
        assertEquals("yo", tax.languages.single().code)
        assertEquals(listOf("2020s"), tax.decades)
    }

    @Test fun decodesTheClassificationShape() {
        val c = saved()
        assertTrue(c.isSeries)
        assertNull(c.contentFormat)
        assertEquals("TV_SERIES", c.effectiveFormat)
        assertEquals(listOf("horror-psychological", "horror"), c.genres)
        assertTrue(c.industries.first().isAuto)
        assertFalse(c.industries.last().isAuto)
        assertNull(c.accessType)
        assertEquals("PAY_PER_VIEW", c.effectiveAccess)
        assertEquals("2027-01-01T00:00:00.000Z", c.availableUntil)
        assertTrue(c.placement.first().eligible)
        assertNull(c.placement.first().reason)
        assertEquals("Not published", c.placement.last().reason)
    }

    @Test fun draftKeepsOnlyManualIndustries() {
        assertEquals(listOf("yoruba-cinema"), ClassificationDraft.from(saved()).industries)
    }

    @Test fun unchangedDraftSendsAnEmptyBody() {
        val base = ClassificationDraft.from(saved())
        val patch = classificationPatch(base, base.copy(), isSeries = true)
        assertTrue(patch.isEmpty())
        assertEquals("{}", json.encodeToString(JsonObject.serializer(), patch))
    }

    @Test fun onlyChangedFieldsAreSent() {
        val base = ClassificationDraft.from(saved())
        val patch = classificationPatch(
            base,
            base.copy(contentFormat = "LIMITED_SERIES", tags = listOf("village", "dark"), seriesComplete = true),
            isSeries = true,
        )
        assertEquals(setOf("contentFormat", "tags", "seriesComplete"), patch.keys)
        assertEquals("LIMITED_SERIES", patch["contentFormat"]!!.jsonPrimitive.content)
        assertEquals(listOf("village", "dark"), patch["tags"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertEquals(JsonPrimitive(true), patch["seriesComplete"])
    }

    @Test fun clearedNullableFieldsAreExplicitNullsOnTheWire() {
        val base = ClassificationDraft.from(saved())
        val patch = classificationPatch(
            base,
            base.copy(audience = null, ageRating = null, availableUntil = null, releaseDate = null),
            isSeries = true,
        )
        assertEquals(setOf("audience", "ageRating", "availableUntil", "releaseDate"), patch.keys)
        patch.values.forEach { assertSame(JsonNull, it) }
        // Even with explicitNulls=false the hand-built body keeps its nulls.
        val wire = json.encodeToString(JsonObject.serializer(), patch)
        assertEquals("""{"audience":null,"ageRating":null,"releaseDate":null,"availableUntil":null}""", wire)
    }

    @Test fun settingAPreviouslyNullFieldSendsTheValue() {
        val base = ClassificationDraft.from(saved())
        val patch = classificationPatch(base, base.copy(accessType = "RENTAL", availableFrom = "2026-11-01T09:00:00.000Z"), true)
        assertEquals(JsonPrimitive("RENTAL"), patch["accessType"])
        assertEquals(JsonPrimitive("2026-11-01T09:00:00.000Z"), patch["availableFrom"])
    }

    @Test fun genreOrderIsAChangeButSetOrderIsNot() {
        val base = ClassificationDraft.from(saved())
        val reordered = base.copy(
            genres = listOf("horror", "horror-psychological"),
            audioLanguages = listOf("en", "yo"),
            collections = listOf("new-listings", "editors-picks"),
        )
        val patch = classificationPatch(base, reordered, isSeries = true)
        assertEquals(setOf("genres"), patch.keys)
        assertEquals(listOf("horror", "horror-psychological"), (patch["genres"] as JsonArray).map { it.jsonPrimitive.content })
    }

    @Test fun emptiedListsAreSentAsEmptyArrays() {
        val base = ClassificationDraft.from(saved())
        val patch = classificationPatch(base, base.copy(industries = emptyList(), productionCountries = emptyList()), true)
        assertEquals(JsonArray(emptyList()), patch["industries"])
        assertEquals(JsonArray(emptyList()), patch["productionCountries"])
    }

    @Test fun seriesCompleteIsNeverSentForMovies() {
        val base = ClassificationDraft.from(saved().copy(type = "movie"))
        assertTrue(classificationPatch(base, base.copy(seriesComplete = true), isSeries = false).isEmpty())
    }

    @Test fun inputHelpers() {
        assertEquals(listOf("a", "b", "c"), toggleOrdered(listOf("a", "b"), "c"))
        assertEquals(listOf("a"), toggleOrdered(listOf("a", "b"), "b"))
        assertEquals(listOf("NG", "gh", "US"), parseCodeList(" NG, gh  US,,NG "))
        assertTrue(isValidLanguageCode("pcm"))
        assertFalse(isValidLanguageCode("EN"))
        assertFalse(isValidLanguageCode("e"))
        assertTrue(isValidReleaseDate("2026-02-28"))
        assertFalse(isValidReleaseDate("2026-02-30"))
        assertFalse(isValidReleaseDate("2026-2-3"))
    }
}
