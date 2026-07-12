package com.cinnetemple.app.core.util

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

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
}
