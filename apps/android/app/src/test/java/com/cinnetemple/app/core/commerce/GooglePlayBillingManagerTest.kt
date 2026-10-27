package com.cinnetemple.app.core.commerce

import org.junit.Assert.assertEquals
import org.junit.Test

class GooglePlayBillingManagerTest {
    @Test
    fun accountBindingIsStableNonPiiSha256() {
        assertEquals(
            "bd7662a5eeb41614e720d477abfcb2272e19a8a70a93b7e3bc8560d44ad326e9",
            googlePlayAccountId("11111111-1111-4111-8111-111111111111"),
        )
        assertEquals(
            googlePlayAccountId("11111111-1111-4111-8111-111111111111"),
            googlePlayAccountId("11111111-1111-4111-8111-111111111111".uppercase()),
        )
    }
}
