import { CUProfile } from './types';

export type SolanaFramework = 'anchor' | 'steel' | 'native' | 'unknown';

export interface FrameworkBenchmark {
  framework: SolanaFramework;
  avgCU: number;
  confidence: number;
}

export interface FrameworkAlternative {
  framework: SolanaFramework;
  avgCU: number;
  deltaAbsolute: number;
  deltaPercent: number;
}

export interface FrameworkComparisonResult {
  current: FrameworkBenchmark;
  alternatives: FrameworkAlternative[];
  confidence: number;
}

const BENCHMARK_REGISTRY: Record<SolanaFramework, number> = {
  anchor: 50_000,
  steel: 40_000,
  native: 30_000,
  unknown: 0,
};

export function detectFramework(logMessages: string[]): FrameworkBenchmark {
  if (logMessages.length === 0) {
    return { framework: 'unknown', avgCU: 0, confidence: 0 };
  }

  const hasAnchorPattern = logMessages.some((message) =>
    message.includes('Program log: Instruction:')
  );

  if (hasAnchorPattern) {
    return {
      framework: 'anchor',
      avgCU: BENCHMARK_REGISTRY.anchor,
      confidence: 0.9,
    };
  }

  const hasSteelPattern = logMessages.some((message) =>
    message.toLowerCase().includes('program log: steel')
  );

  if (hasSteelPattern) {
    return {
      framework: 'steel',
      avgCU: BENCHMARK_REGISTRY.steel,
      confidence: 0.75,
    };
  }

  return {
    framework: 'native',
    avgCU: BENCHMARK_REGISTRY.native,
    confidence: 0.5,
  };
}

export function compareFrameworks(
  logMessages: string[],
  cuProfile: CUProfile
): FrameworkComparisonResult {
  const current = detectFramework(logMessages);
  const actualCU = cuProfile.totalConsumed;

  const alternatives = (Object.keys(BENCHMARK_REGISTRY) as SolanaFramework[])
    .filter(
      (framework) =>
        framework !== 'unknown' && framework !== current.framework
    )
    .map((framework) => {
      const avgCU = BENCHMARK_REGISTRY[framework];
      const deltaAbsolute = actualCU - avgCU;
      const deltaPercent = actualCU === 0
        ? 0
        : (deltaAbsolute / actualCU) * 100;

      return {
        framework,
        avgCU,
        deltaAbsolute,
        deltaPercent,
      };
    })
    .sort((a, b) => a.avgCU - b.avgCU);

  return {
    current,
    alternatives,
    confidence: current.confidence,
  };
}
