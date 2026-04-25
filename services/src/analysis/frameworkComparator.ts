import benchmarks from '../data/framework-benchmarks.json';
import { ParsedInstruction } from './types';

export type Confidence = 'high' | 'medium' | 'low';

export interface FrameworkBenchmark {
  operation: string;
  framework: string;
  estimatedCU: number;
  confidence: Confidence;
  source: string;
}

export interface FrameworkComparison {
  operation: string;
  currentFramework: string;
  currentCU: number;
  alternatives: {
    framework: string;
    estimatedCU: number;
    savings: number;
    confidence: Confidence;
  }[];
}

// This is a placeholder for a more sophisticated framework detection logic.
// In a real scenario, this would involve analyzing the program's IDL,
// instruction data patterns, or other on-chain artifacts.
function detectFramework(programId: string): string {
  // For now, we'll use a simple hardcoded map.
  const knownFrameworks: { [key: string]: string } = {
    JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter V6',
    '11111111111111111111111111111111': 'Native',
    // Add other known program IDs and their frameworks here
  };
  return knownFrameworks[programId] || 'Unknown';
}
// Export for testing purposes
export { detectFramework };
/**
 * Compares the CU consumption of an instruction against a known baseline of frameworks.
 *
 * @param instruction - The parsed instruction to verify.
 * @param detectFrameworkFn - Optional. A function to detect the framework. Used for testing.
 * @returns A comparison result with potential alternatives if available.
 */
export function compareFrameworks(
  instruction: ParsedInstruction,
  detectFrameworkFn: (programId: string) => string = detectFramework
): FrameworkComparison | null {
  const { programId, name: operation, cuConsumed } = instruction;

  if (cuConsumed === undefined || !operation) {
    return null;
  }

  const currentFramework = detectFrameworkFn(programId);
  if (currentFramework === 'Unknown') {
    return null;
  }

  const relevantBenchmarks = (benchmarks as FrameworkBenchmark[]).filter(
    (b) => b.operation === operation && b.framework !== currentFramework
  );

  if (relevantBenchmarks.length === 0) {
    return null;
  }

  const alternatives = relevantBenchmarks.map((benchmark) => ({
    framework: benchmark.framework,
    estimatedCU: benchmark.estimatedCU,
    savings: cuConsumed - benchmark.estimatedCU,
    confidence: benchmark.confidence,
  }));

  return {
    operation,
    currentFramework,
    currentCU: cuConsumed,
    alternatives,
  };
}
