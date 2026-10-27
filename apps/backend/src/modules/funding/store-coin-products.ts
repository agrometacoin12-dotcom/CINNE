/** Store-managed consumable packs shared by Apple and Google Play. */
export const STORE_COIN_PACKS = [500, 1000, 2500, 5000].map((coins) => ({
  productId: `com.cinnetemple.coins.${coins}`,
  coins,
}));
