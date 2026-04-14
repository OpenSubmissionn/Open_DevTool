import programsData from '../data/programs.json';

/**
 * Get human-readable name for a Solana program ID
 *
 * @param programId - The program ID (public key as string)
 * @returns Program name or "Unknown Program" if not found
 *
 * @example
 * getProgramName("11111111111111111111111111111111")
 * // Returns: "System Program"
 */
export function getProgramName(programId: string): string {
  const program = programsData[programId as keyof typeof programsData];
  return program ? program.name : 'Unknown Program';
}

/**
 * Get full program info (name + category + description)
 *
 * @param programId - The program ID
 * @returns Program info object or null if not found
 *
 * @example
 * getProgramInfo("TokenkegQfeZyiNwAJsyFbPVwwQQfubRS6R8wDkxjn4")
 * // Returns: {
 * //   name: "Token Program",
 * //   category: "token",
 * //   description: "..."
 * // }
 */
export function getProgramInfo(programId: string) {
  return programsData[programId as keyof typeof programsData] || null;
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