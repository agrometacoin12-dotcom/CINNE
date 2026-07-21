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
 * Viewer-facing episode of a series. Raw video keys never reach clients —
 * only `hasVideo`. `consumed` (per-episode watch-once state) is present ONLY
 * when the title fetch carried a Bearer token; default-null keeps movie JSON
 * (which has neither field nor season tree) decoding exactly as before.
 */
@Serializable
data class EpisodeDto(
    val id: String = "",
    val number: Int = 0,
    val name: String = "",
    val overview: String? = null,
    val runtimeMinutes: Int? = null,
    val hasVideo: Boolean = false,
    /** Watch-once flag; only present on authenticated title fetches. */
    val consumed: Boolean? = null,
)

@Serializable
data class SeasonDto(
    val id: String = "",
    val number: Int = 0,
    val name: String? = null,
    val episodes: List<EpisodeDto> = emptyList(),
) {
    /** Chip label: custom name when set, otherwise "Season N" (parity with iOS). */
    val displayName: String get() = name?.takeIf { it.isNotBlank() } ?: "Season $number"
}

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
    /** Present only on PUBLISHED series: the seasons/episodes tree. Movies: absent. */
    val seasonsList: List<SeasonDto>? = null,
) {
    fun toSummary() = TitleSummary(id, type, title, year, rating, genres, posterUrl)

    val isSeries: Boolean get() = type == "series"

    /** Any episode with a video at all (drives the series CTA enabled state). */
    val hasPlayableEpisode: Boolean
        get() = seasonsList.orEmpty().any { season -> season.episodes.any { it.hasVideo } }

    /**
     * The first playable, not-yet-watched episode across all seasons — the
     * target of the entitled-series main CTA ("Play S<season> E<num>").
     */
    fun firstUnwatchedPlayable(): Pair<SeasonDto, EpisodeDto>? {
        for (season in seasonsList.orEmpty()) {
            val episode = season.episodes.firstOrNull { it.hasVideo && it.consumed != true }
            if (episode != null) return season to episode
        }
        return null
    }
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
