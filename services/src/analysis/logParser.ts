// services/src/analysis/logParser.ts

export interface ParsedLogs {
  byProgram: Record<string, any>;
  errors: string[];
  totalLines: number;
}

export function parseLogsFromBundle(logMessages: string[]): ParsedLogs {
  // Initialize the result object
  const result: ParsedLogs = {
    byProgram: {},
    errors: [],
    totalLines: logMessages.length,
  };

  // Helper function to ensure the program exists in our object
  const initProgramIfNeeded = (programId: string) => {
    if (!result.byProgram[programId]) {
      result.byProgram[programId] = { consumed: 0, limit: 0, invocations: 0, messages: [] };
    }
  };

  // Iterate through each blockchain log message
  for (const line of logMessages) {
    
    // 1. Match Compute Unit (CU) consumption lines
    const cuRegex = /Program (\w+) consumed (\d+) of (\d+) compute units/;
    const cuMatch = line.match(cuRegex);
    if (cuMatch) {
      const programId = cuMatch[1];
      const consumed = parseInt(cuMatch[2], 10);
      const limit = parseInt(cuMatch[3], 10);

      initProgramIfNeeded(programId);
      result.byProgram[programId].consumed += consumed;
      result.byProgram[programId].limit = limit;
      continue; // Move to the next line
    }

    // 2. Match Cross-Program Invocations (CPI)
    // e.g., "Program 111111 invoke [1]"
    const invokeRegex = /Program (\w+) invoke \[(\d+)\]/;
    const invokeMatch = line.match(invokeRegex);
    if (invokeMatch) {
      const programId = invokeMatch[1];
      
      initProgramIfNeeded(programId);
      result.byProgram[programId].invocations += 1;
      continue; 
    }

    // 3. Match standard program logs
    // e.g., "Program log: Instruction: Transfer"
    const logRegex = /Program log: (.*)/;
    const logMatch = line.match(logRegex);
    if (logMatch) {
      const message = logMatch[1];
      
      // If the log is actually an error, save it in the errors array
      if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fail')) {
        result.errors.push(message);
      }
      continue;
    }

    // 4. Match explicitly failed programs
    // e.g., "Program 111111 failed: custom program error: 0x1"
    const failRegex = /Program (\w+) failed: (.*)/;
    const failMatch = line.match(failRegex);
    if (failMatch) {
      const programId = failMatch[1];
      const errorMessage = failMatch[2];
      result.errors.push(`Program ${programId} failed: ${errorMessage}`);
      continue;
    }
  }

  return result;
}