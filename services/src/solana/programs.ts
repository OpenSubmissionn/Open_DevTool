import programsData from '../data/programs.json';
import axios from 'axios';

// Simple in-memory cache to avoid redundant API calls during a single session.
const apiCache = new Map<string, any>();

/**
 * Fetches program/token metadata from the Helius API.
 *
 * @param programId - The program or token mint address.
 * @param apiKey - The Helius API key.
 * @returns The program info or null if not found.
 */
async function fetchProgramInfoFromAPI(programId: string, apiKey: string): Promise<any | null> {
  if (apiCache.has(programId)) {
    return apiCache.get(programId);
  }

  const url = `https://api.helius.xyz/v0/token-metadata?api-key=${apiKey}`;
  try {
    const { data } = await axios.post(url, {
      mintAccounts: [programId],
      includeOffChain: true,
    });

    if (data && data.length > 0 && data[0].onChainAccountInfo) {
      const metadata = data[0];
      const info = {
        name:
          metadata.offChainMetadata?.metadata?.name ||
          metadata.onChainMetadata?.metadata?.data?.name ||
          'Unknown',
        category: 'token', // Assume 'token' for now from this endpoint
        description: metadata.offChainMetadata?.metadata?.description || '',
      };
      apiCache.set(programId, info);
      return info;
    }
    apiCache.set(programId, null); // Cache the fact that it wasn't found
    return null;
  } catch (error) {
    // Don't log errors for not found, but log other potential issues.
    if (axios.isAxiosError(error) && error.response?.status !== 404) {
      console.error('Helius API Error:', error.message);
    }
    apiCache.set(programId, null);
    return null;
  }
}

/**
 * Get human-readable name for a Solana program ID.
 * It first checks the local JSON file and then falls back to an API call.
 *
 * @param programId - The program ID (public key as string)
 * @returns Program name or "Unknown Program" if not found
 */
export async function getProgramName(programId: string): Promise<string> {
  const localProgram = programsData[programId as keyof typeof programsData];
  if (localProgram) {
    return localProgram.name;
  }

  const apiKey = process.env.HELIUS_API_KEY;
  if (apiKey) {
    const apiProgram = await fetchProgramInfoFromAPI(programId, apiKey);
    if (apiProgram) {
      return apiProgram.name;
    }
  }

  return 'Unknown Program';
}

/**
 * Get full program info (name + category + description).
 * It first checks the local JSON file and then falls back to an API call.
 *
 * @param programId - The program ID
 * @returns Program info object or null if not found
 */
export async function getProgramInfo(
  programId: string
): Promise<{ name: string; category: string; description: string } | null> {
  const program = programsData[programId as keyof typeof programsData];
  if (program) {
    return program;
  }

  const apiKey = process.env.HELIUS_API_KEY;
  if (apiKey) {
    return fetchProgramInfoFromAPI(programId, apiKey);
  }

  return null;
}

/**
 * Check if a program ID is known
 *
 * @param programId - The program ID
 * @returns true if program exists in registry, false otherwise
 */
export function isProgramKnown(programId: string): boolean {
  return programId in programsData;
}

/**
 * Get all programs in a category
 *
 * @param category - The category (e.g., "defi", "nft", "system")
 * @returns Array of program IDs in that category
 */
export function getProgramsByCategory(category: string): string[] {
  return Object.entries(programsData)
    .filter(([_, program]) => program.category === category)
    .map(([id, _]) => id);
}

export default programsData;
