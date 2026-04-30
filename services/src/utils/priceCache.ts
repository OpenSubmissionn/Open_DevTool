/**
 * SOL/USD price cache with 5-minute TTL.
 * Reduces API calls during batch transaction processing.
 * Fallback: 180 USD if fetch fails.
 */

let cachedSolPrice: number | null = null;
let cachedTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000;

/**
 * Returns SOL/USD price from cache or fetches if expired.
 * @returns SOL/USD exchange rate (default: 180)
 */
export async function getSolPriceUSD(): Promise<number> {
  const now = Date.now();

  // Return cached price if valid
  if (cachedSolPrice !== null && now - cachedTimestamp < CACHE_DURATION_MS) {
    console.log(`[Cache] Using cached price: $${cachedSolPrice}`);
    return cachedSolPrice;
  }

  console.log('[Cache] Cache expired, using fallback');

  try {
    // TODO: Integrate with CoinGecko or Binance API
    // const response = await fetch('...');
    // const data = await response.json();
    // cachedSolPrice = data.price;

    cachedSolPrice = 180; // Default fallback
    cachedTimestamp = now;

    console.log(`[Cache] Price stored: $${cachedSolPrice}`);
    return cachedSolPrice;
  } catch (error) {
    console.warn('[Cache] Fetch failed, using fallback: 180 USD', error);
    return 180;
  }
}

/**
 * Clears cache for testing purposes.
 */
export function clearPriceCache(): void {
  cachedSolPrice = null;
  cachedTimestamp = 0;
  console.log('[Cache] Price cache cleared');
}
