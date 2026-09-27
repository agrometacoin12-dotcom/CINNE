package com.cinnetemple.app.core.util

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale
import java.util.UUID
import kotlin.math.abs

/**
 * NGN kobo formatting — the ONLY money display rule in the app:
 * priceMinor 250000 -> "₦2,500" (decimals only when kobo matter, e.g. 250050 -> "₦2,500.50").
 */
object Money {

    private val NIGERIA: Locale = Locale.forLanguageTag("en-NG")

    /** Formats minor units (kobo) as naira, e.g. 150000 -> ₦1,500. */
    fun formatMinor(minor: Long, currencyCode: String = "NGN"): String {
        val format = NumberFormat.getCurrencyInstance(NIGERIA)
        runCatching { format.currency = Currency.getInstance(currencyCode) }
        val hasSubunits = minor % 100L != 0L
        format.minimumFractionDigits = if (hasSubunits) 2 else 0
        format.maximumFractionDigits = if (hasSubunits) 2 else 0
        return format.format(minor / 100.0)
    }

    /** Price label for CTAs — "Free" when priceMinor <= 0 (server grants instantly). */
    fun priceLabel(priceMinor: Long, currencyCode: String = "NGN"): String =
        if (priceMinor <= 0) "Free" else formatMinor(priceMinor, currencyCode)

    // --- Coins (1 coin = ₦1) — web formatNaira / formatCoins parity ---

    /** Comma thousands, no decimals: 12500 -> "12,500". */
    fun grouped(n: Long): String = String.format(Locale.US, "%,d", n)

    /** Whole naira, no decimals: 12500 -> "₦12,500" (negatives -> "−₦12,500"). Never "$". */
    fun naira(amount: Long): String = (if (amount < 0) "−" else "") + "₦" + grouped(abs(amount))

    /** Kobo as whole naira, kobo dropped (web formatKobo parity): 15000050 -> "₦150,000". */
    fun wholeNaira(minor: Long): String = naira(minor / 100L)

    /** 12500 -> "12,500 coins", 1 -> "1 coin". */
    fun coins(n: Long): String = grouped(n) + if (abs(n) == 1L) " coin" else " coins"

    /** One per submit attempt (send / fund), regenerated after success — a double-tap lands once. */
    fun newIdempotencyKey(): String = UUID.randomUUID().toString()
}
