import { CUProfile, CUEntry } from "./types"; 

export function profileCU(logMessages: string[]): CUProfile {
  let totalConsumed = 0;
  let totalLimit = 0;
  const perInstruction: CUEntry[] = [];
  let bottleneck: CUEntry | null = null;

  const cuRegex = /consumed (\d+) of (\d+) compute units/;

  for (const log of logMessages) {
    const match = log.match(cuRegex);
    if (match) {
      const consumed = parseInt(match[1], 10);
      const limit = parseInt(match[2], 10);

      totalConsumed += consumed;
      totalLimit += limit;

      const currentEntry: CUEntry = {
        cuConsumed: consumed,
        cuLimit: limit,
        utilizationPercent: (consumed / limit) * 100,
        programId: "Unknown Program ID", 
        programName: "Unknown Program",  
        depth: 0, 
      };
      perInstruction.push(currentEntry);

      if (!bottleneck || currentEntry.cuConsumed > bottleneck.cuConsumed) {
        bottleneck = currentEntry;
      }
    }
  }

  const utilizationPercent = totalLimit > 0 ? (totalConsumed / totalLimit) * 100 : 0;

  return {
    totalConsumed,
    totalLimit,
    utilizationPercent,
    perInstruction,
    bottleneck: bottleneck || { cuConsumed: 0, cuLimit: 0, utilizationPercent: 0, programId: "N/A", programName: "N/A", depth: 0 }, // <-- CORRIGIDO
  };
}
