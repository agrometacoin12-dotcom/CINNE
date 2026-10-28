package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.putJsonArray

// ---------------------------------------------------------------------------
// GET /v1/admin/taxonomy (docs/content-classification.md, "Admin API")
// ---------------------------------------------------------------------------

@Serializable
data class TaxonomyItem(
    val slug: String = "",
    val name: String = "",
)

@Serializable
data class TaxonomyGenre(
    val slug: String = "",
    val name: String = "",
    val subgenres: List<TaxonomyItem> = emptyList(),
)

/** kind: MOOD | THEME | SETTING | CHARACTER | STORY. */
@Serializable
data class TaxonomyTag(
    val slug: String = "",
    val name: String = "",
    val kind: String = "",
)

/** kind: EDITORIAL | SYSTEM (SYSTEM = the legacy browse-row slugs). */
@Serializable
data class TaxonomyCollection(
    val slug: String = "",
    val name: String = "",
    val kind: String = "",
)

/** Enum choice: formats (ContentFormat), audiences, access types. */
@Serializable
data class TaxonomyOption(
    val value: String = "",
    val label: String = "",
)

@Serializable
data class TaxonomyLanguage(
    val code: String = "",
    val name: String = "",
)

@Serializable
data class AdminTaxonomy(
    val genres: List<TaxonomyGenre> = emptyList(),
    val tags: List<TaxonomyTag> = emptyList(),
    val industries: List<TaxonomyItem> = emptyList(),
    val collections: List<TaxonomyCollection> = emptyList(),
    val formats: List<TaxonomyOption> = emptyList(),
    val audiences: List<TaxonomyOption> = emptyList(),
    val accessTypes: List<TaxonomyOption> = emptyList(),
    val languages: List<TaxonomyLanguage> = emptyList(),
    val decades: List<String> = emptyList(),
)

// ---------------------------------------------------------------------------
// GET / PUT /v1/admin/titles/{id}/classification
// ---------------------------------------------------------------------------

/** source: "manual" | "auto". AUTO rows are recomputed by the server on every write. */
@Serializable
data class ClassifiedIndustry(
    val slug: String = "",
    val name: String = "",
    val source: String = "manual",
) {
    val isAuto: Boolean get() = source.equals("auto", ignoreCase = true)
}

/** One enabled RULE section whose rules match the title. [reason] explains an eligibility failure. */
@Serializable
data class SectionPlacement(
    val slug: String = "",
    val title: String = "",
    val eligible: Boolean = false,
    val reason: String? = null,
)

@Serializable
data class TitleClassification(
    val titleId: String = "",
    val type: String = "movie", // "movie" | "series"
    val contentFormat: String? = null,
    val effectiveFormat: String = "",
    val genres: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val collections: List<String> = emptyList(),
    val industries: List<ClassifiedIndustry> = emptyList(),
    val audience: String? = null,
    val ageRating: String? = null,
    val ratingJurisdiction: String? = null,
    val releaseDate: String? = null, // "YYYY-MM-DD"
    val accessType: String? = null,
    val effectiveAccess: String = "",
    val productionCountries: List<String> = emptyList(),
    val originalLanguages: List<String> = emptyList(),
    val audioLanguages: List<String> = emptyList(),
    val availableFrom: String? = null, // ISO timestamp
    val availableUntil: String? = null,
    val seriesComplete: Boolean = false,
    val placement: List<SectionPlacement> = emptyList(),
) {
    val isSeries: Boolean get() = type == "series"
}

/**
 * The editable part of a classification (ClassificationInput). [industries] are
 * the MANUAL slugs only — AUTO industries are derived server-side.
 */
data class ClassificationDraft(
    val contentFormat: String? = null,
    val genres: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val collections: List<String> = emptyList(),
    val industries: List<String> = emptyList(),
    val audience: String? = null,
    val ageRating: String? = null,
    val ratingJurisdiction: String? = null,
    val releaseDate: String? = null,
    val accessType: String? = null,
    val productionCountries: List<String> = emptyList(),
    val originalLanguages: List<String> = emptyList(),
    val audioLanguages: List<String> = emptyList(),
    val availableFrom: String? = null,
    val availableUntil: String? = null,
    val seriesComplete: Boolean = false,
) {
    companion object {
        fun from(dto: TitleClassification) = ClassificationDraft(
            contentFormat = dto.contentFormat,
            genres = dto.genres,
            tags = dto.tags,
            collections = dto.collections,
            industries = dto.industries.filterNot { it.isAuto }.map { it.slug },
            audience = dto.audience,
            ageRating = dto.ageRating,
            ratingJurisdiction = dto.ratingJurisdiction,
            releaseDate = dto.releaseDate,
            accessType = dto.accessType,
            productionCountries = dto.productionCountries,
            originalLanguages = dto.originalLanguages,
            audioLanguages = dto.audioLanguages,
            availableFrom = dto.availableFrom,
            availableUntil = dto.availableUntil,
            seriesComplete = dto.seriesComplete,
        )
    }
}

/**
 * PUT body with ONLY the fields that differ between [base] and [edited].
 * Unchanged fields are omitted (= unchanged server-side); a nullable field that
 * was cleared is sent as an explicit JSON null (= clear). Genres keep selection
 * order, so a reorder counts as a change. Collections, tags, industries and
 * codes compare as sets. `seriesComplete` is only sent for series.
 */
fun classificationPatch(
    base: ClassificationDraft,
    edited: ClassificationDraft,
    isSeries: Boolean,
): JsonObject = buildJsonObject {
    fun scalar(key: String, old: String?, new: String?) {
        if (old != new) put(key, new?.let(::JsonPrimitive) ?: JsonNull)
    }
    fun list(key: String, old: List<String>, new: List<String>, ordered: Boolean = false) {
        val changed = if (ordered) old != new else old.toSet() != new.toSet() || old.size != new.size
        if (changed) putJsonArray(key) { new.forEach { add(it) } }
    }
    scalar("contentFormat", base.contentFormat, edited.contentFormat)
    list("genres", base.genres, edited.genres, ordered = true)
    list("tags", base.tags, edited.tags)
    list("collections", base.collections, edited.collections)
    list("industries", base.industries, edited.industries)
    scalar("audience", base.audience, edited.audience)
    scalar("ageRating", base.ageRating, edited.ageRating)
    scalar("ratingJurisdiction", base.ratingJurisdiction, edited.ratingJurisdiction)
    scalar("releaseDate", base.releaseDate, edited.releaseDate)
    scalar("accessType", base.accessType, edited.accessType)
    list("productionCountries", base.productionCountries, edited.productionCountries)
    list("originalLanguages", base.originalLanguages, edited.originalLanguages)
    list("audioLanguages", base.audioLanguages, edited.audioLanguages)
    scalar("availableFrom", base.availableFrom, edited.availableFrom)
    scalar("availableUntil", base.availableUntil, edited.availableUntil)
    if (isSeries && base.seriesComplete != edited.seriesComplete) {
        put("seriesComplete", JsonPrimitive(edited.seriesComplete))
    }
}
