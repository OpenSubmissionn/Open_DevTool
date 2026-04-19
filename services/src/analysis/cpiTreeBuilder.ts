export interface ExecutionError {
  rawMessage: string;
  code?: string;
}

export interface ExecutionSnapshot {
  programId: string;
  depth: number;
  status: 'success' | 'failed' | 'truncated';
  logs: string[];
  dataLogs: string[];
  computeUnitsConsumed?: number;
  error?: ExecutionError;
  children: ExecutionSnapshot[];
}

export interface ExecutionTrace {
  roots: ExecutionSnapshot[];
  totalComputeUnits: number;
  isTruncated: boolean;
}

const REGEX = {
  INVOKE: /^Program (\w+) invoke \[(\d+)\]$/,
  SUCCESS: /^Program (\w+) success$/,
  FAILED: /^Program (\w+) failed: (.*)$/,
  CU: /^Program (\w+) consumed (\d+) of \d+ compute units$/,
  LOG: /^Program log: (.*)$/,
  DATA: /^Program (data|return): (.*)$/
};

export function buildCPITree(logMessages: string[]): ExecutionTrace {
  const trace: ExecutionTrace = { roots: [], totalComputeUnits: 0, isTruncated: false };
  const stack: ExecutionSnapshot[] = [];

  for (const line of logMessages) {
    const invokeMatch = line.match(REGEX.INVOKE);
    if (invokeMatch) {
      const node: ExecutionSnapshot = {
        programId: invokeMatch[1],
        depth: parseInt(invokeMatch[2], 10),
        status: 'truncated',
        logs: [],
        dataLogs: [],
        children: []
      };

      if (stack.length === 0) trace.roots.push(node);
      else stack[stack.length - 1].children.push(node);
      
      stack.push(node);
      continue;
    }

    if (stack.length === 0) continue;
    const activeNode = stack[stack.length - 1];

    const logMatch = line.match(REGEX.LOG);
    if (logMatch) { activeNode.logs.push(logMatch[1]); continue; }

    const dataMatch = line.match(REGEX.DATA);
    if (dataMatch) { activeNode.dataLogs.push(dataMatch[2]); continue; }

    const cuMatch = line.match(REGEX.CU);
    if (cuMatch && cuMatch[1] === activeNode.programId) {
      const consumed = parseInt(cuMatch[2], 10);
      activeNode.computeUnitsConsumed = consumed;
      trace.totalComputeUnits += consumed;
      continue;
    }

    const successMatch = line.match(REGEX.SUCCESS);
    if (successMatch && successMatch[1] === activeNode.programId) {
      activeNode.status = 'success';
      stack.pop();
      continue;
    }

    const failedMatch = line.match(REGEX.FAILED);
    if (failedMatch && failedMatch[1] === activeNode.programId) {
      activeNode.status = 'failed';
      activeNode.error = { rawMessage: failedMatch[2] };
      const codeMatch = failedMatch[2].match(/custom program error: (0x[0-9a-fA-F]+|\d+)/);
      if (codeMatch) activeNode.error.code = codeMatch[1];
      stack.pop();
      continue;
    }
  }

  if (stack.length > 0) trace.isTruncated = true;
  return trace;
}
