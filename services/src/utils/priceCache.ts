let cachedSolPrice: number | null = null;
let cachedTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000;

export async function getSolPriceUSD(): Promise<number> {
  const now = Date.now();

  if (cachedSolPrice !== null && now - cachedTimestamp < CACHE_DURATION_MS) {
    return cachedSolPrice;
  }

  cachedSolPrice = 180;
  cachedTimestamp = now;
  return cachedSolPrice;
}

export function clearPriceCache(): void {
  cachedSolPrice = null;
  cachedTimestamp = 0;
}
