package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/** Compact catalogue card used in browse rows / search results / watchlist. */
@Serializable
data class TitleSummary(
    val id: String = "",
    val type: String = "movie", // "movie" | "series"
    val title: String = "",
    val year: Int = 0,
    val rating: Double? = null,
    val genres: List<String> = emptyList(),
    val posterUrl: String? = null,
)

/**
 * Full title shape (browse.hero, GET /v1/catalogue/titles/{id}, premieres list).
 * priceMinor is NGN kobo — 0 means free (instant grant, no checkout).
 */
@Serializable
data class TitleDetail(
    val id: String = "",
    val type: String = "movie",
    val title: String = "",
    val year: Int = 0,
    val rating: Double? = null,
    val genres: List<String> = emptyList(),
    val posterUrl: String? = null,
    val tagline: String? = null,
    val overview: String = "",
    val runtimeMinutes: Int? = null,
    val seasons: Int? = null,
    val maturityRating: String? = null,
    val heroUrl: String? = null,
    val cast: List<String> = emptyList(),
    val director: String? = null,
    val categories: List<String> = emptyList(),
    val priceMinor: Long = 0,
    val currency: String = "NGN",
    val durationSeconds: Int? = null,
    val isPremiere: Boolean = false,
    val premiereStartAt: String? = null,
    val premiereLive: Boolean = false,
    /** false => playback start will 404 ("no video yet") — hide/disable Play. */
    val hasVideo: Boolean = false,
) {
    fun toSummary() = TitleSummary(id, type, title, year, rating, genres, posterUrl)
}

/** Row slugs are fixed: new-listings, trending, most-watched, coming-soon, new-releases, acclaimed, series. */
@Serializable
data class BrowseRow(
    val slug: String = "",
    val title: String = "",
    val items: List<TitleSummary> = emptyList(),
)

/** GET /v1/catalogue/browse — hero is the single featured title or null. */
@Serializable
data class BrowseResponse(
    val hero: TitleDetail? = null,
    val rows: List<BrowseRow> = emptyList(),
)

/** GET /v1/catalogue/search?q= */
@Serializable
data class SearchResponse(
    val query: String = "",
    val results: List<TitleSummary> = emptyList(),
)

/** GET /v1/watchlist item — `title` is null when the catalogue entry was deleted (hide the row). */
@Serializable
data class WatchlistItem(
    val titleId: String = "",
    val addedAt: String = "",
    val title: TitleSummary? = null,
)

@Serializable
data class AddWatchlistRequest(val titleId: String)
