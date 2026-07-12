package com.cinnetemple.app.ui.feature.premieres

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * ISO-8601 helpers for premiere showtimes. minSdk 24 has no java.time and the
 * project does not enable core-library desugaring, so this uses
 * SimpleDateFormat with a normalisation pass (fractional seconds clamped to
 * millis, `Z`/`+HH:MM` offsets folded to RFC-822 `+HHMM`).
 */
internal fun parseIsoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    val trimmed = iso.trim()
    // Clamp fractional seconds to exactly 3 digits (SimpleDateFormat "SSS"
    // mis-parses longer fractions as whole milliseconds).
    val clamped = Regex("""\.(\d+)""").replace(trimmed) { m ->
        "." + m.groupValues[1].padEnd(3, '0').take(3)
    }
    val normalized = clamped
        .replace(Regex("""[zZ]$"""), "+0000")
        .replace(Regex("""([+-]\d{2}):(\d{2})$"""), "$1$2")
    val pattern = when {
        normalized.contains('.') -> "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        Regex("""[+-]\d{4}$""").containsMatchIn(normalized) -> "yyyy-MM-dd'T'HH:mm:ssZ"
        else -> "yyyy-MM-dd'T'HH:mm:ss"
    }
    return try {
        SimpleDateFormat(pattern, Locale.US).parse(normalized)?.time
    } catch (_: Exception) {
        null
    }
}

/** "Jul 12, 8:00 PM" — the iOS abbreviated-date/short-time style. */
internal fun formatShowtime(millis: Long): String =
    SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date(millis))

/** iOS CountdownText format: "2d 4h 12m" past a day, else "1h 04m 09s", "Starting…" at zero. */
internal fun formatCountdown(remainingMillis: Long): String {
    if (remainingMillis <= 0) return "Starting…"
    val totalSeconds = remainingMillis / 1000
    val days = totalSeconds / 86_400
    val hours = (totalSeconds % 86_400) / 3_600
    val minutes = (totalSeconds % 3_600) / 60
    val seconds = totalSeconds % 60
    return if (days > 0) {
        "${days}d ${hours}h ${minutes}m"
    } else {
        "${hours}h " + "%02dm %02ds".format(Locale.US, minutes, seconds)
    }
}
