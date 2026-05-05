let cachedSolPrice: number | null = null;
let cachedTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3_000;
const FALLBACK_SOL_PRICE_USD = 180;

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

async function fetchLiveSolPriceUSD(): Promise<number | null> {
  // Tests and offline runs disable this lookup; the cached fallback handles it.
  if (process.env.OPEN_DISABLE_PRICE_FETCH === '1') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(COINGECKO_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const body: any = await res.json();
    const price = body?.solana?.usd;
    return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getSolPriceUSD(): Promise<number> {
  const now = Date.now();

  if (cachedSolPrice !== null && now - cachedTimestamp < CACHE_DURATION_MS) {
    return cachedSolPrice;
  }

  const live = await fetchLiveSolPriceUSD();
  cachedSolPrice = live ?? cachedSolPrice ?? FALLBACK_SOL_PRICE_USD;
  cachedTimestamp = now;
  return cachedSolPrice;
}

export function clearPriceCache(): void {
  cachedSolPrice = null;
  cachedTimestamp = 0;
}
