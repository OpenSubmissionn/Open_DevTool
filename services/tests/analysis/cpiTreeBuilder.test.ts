import { describe, it, expect } from 'vitest';
import { buildCPITree } from '../../src/analysis/cpiTreeBuilder';

describe('CPI Tree Builder', () => {

  it('1. Deve processar árvore profunda com múltiplos filhos e erros mistos', () => {
    const massiveLogs = [
      'Program 1111 invoke [1]',
      'Program log: Iniciando tx principal',
      'Program 2222 invoke [2]',
      'Program log: Filho 1 processando',
      'Program 2222 consumed 500 of 200000 compute units',
      'Program 2222 success',
      'Program 3333 invoke [2]',
      'Program log: Filho 2 abriu',
      'Program 4444 invoke [3]',
      'Program data: base64/xxx=',
      'Program 4444 consumed 1000 of 200000 compute units',
      'Program 4444 success',
      'Program 3333 failed: custom program error: 0x10',
      'Program 1111 consumed 5000 of 200000 compute units',
      'Program 1111 failed: custom program error: 0x1',
    ];

    const trace = buildCPITree(massiveLogs);

    expect(trace.totalComputeUnits).toBe(6500);
    expect(trace.isTruncated).toBe(false);
    expect(trace.roots.length).toBe(1);

    const root = trace.roots[0];
    expect(root.programId).toBe('1111');
    expect(root.status).toBe('failed');
    expect(root.children.length).toBe(2);

    const child1 = root.children[0];
    expect(child1.programId).toBe('2222');
    expect(child1.status).toBe('success');
    expect(child1.computeUnitsConsumed).toBe(500);

    const child2 = root.children[1];
    expect(child2.programId).toBe('3333');
    expect(child2.status).toBe('failed');
    expect(child2.error?.code).toBe('0x10');
    expect(child2.children.length).toBe(1);

    const grandson = child2.children[0];
    expect(grandson.programId).toBe('4444');
    expect(grandson.depth).toBe(3);
    expect(grandson.status).toBe('success');
  });

  it('2. Deve marcar a árvore como truncada se os logs forem cortados pela RPC', () => {
    const truncatedLogs = [
      'Program AAAA invoke [1]',
      'Program log: Estamos fazendo algo pesado...',
      'Program BBBB invoke [2]',
      'Program log: Vai cortar agora...',
    ];

    const trace = buildCPITree(truncatedLogs);

    expect(trace.isTruncated).toBe(true);
    expect(trace.roots[0].status).toBe('truncated');
    expect(trace.roots[0].children[0].programId).toBe('BBBB');
    expect(trace.roots[0].children[0].status).toBe('truncated');
  });

  it('3. Deve lidar com falhas imediatas sem consumo de CU', () => {
    const fastFailLogs = [
      'Program FFFF invoke [1]',
      'Program FFFF failed: invalid account data',
    ];

    const trace = buildCPITree(fastFailLogs);

    expect(trace.totalComputeUnits).toBe(0);
    expect(trace.roots[0].status).toBe('failed');
    expect(trace.roots[0].error?.rawMessage).toBe('invalid account data');
    expect(trace.roots[0].error?.code).toBeUndefined();
  });

  it('4. Deve fechar nós abertos como truncados quando novo invoke no mesmo depth aparece', () => {
    const repeatedDepthLogs = [
      'Program Root invoke [1]',
      'Program ChildA invoke [2]',
      'Program log: child A ficou aberto',
      'Program ChildB invoke [2]',
      'Program ChildB consumed 120 of 200000 compute units',
      'Program ChildB success',
      'Program Root consumed 500 of 200000 compute units',
      'Program Root success',
    ];

    const trace = buildCPITree(repeatedDepthLogs);

    expect(trace.isTruncated).toBe(true);
    expect(trace.totalComputeUnits).toBe(620);
    expect(trace.roots).toHaveLength(1);

    const root = trace.roots[0];
    expect(root.status).toBe('success');
    expect(root.children).toHaveLength(2);
    expect(root.children[0].programId).toBe('ChildA');
    expect(root.children[0].status).toBe('truncated');
    expect(root.children[1].programId).toBe('ChildB');
    expect(root.children[1].status).toBe('success');
  });

  it('5. Deve manter consistência em deep CPI com fechamento parcial', () => {
    const deepLogs = [
      'Program Root invoke [1]',
      'Program Level1 invoke [2]',
      'Program Level2 invoke [3]',
      'Program Level3 invoke [4]',
      'Program Level3 consumed 70 of 200000 compute units',
      'Program Level3 success',
      'Program Level2 consumed 80 of 200000 compute units',
      'Program Level2 success',
      'Program Level1 consumed 90 of 200000 compute units',
      'Program Level1 success',
      'Program Root consumed 100 of 200000 compute units',
      'Program Root success',
    ];

    const trace = buildCPITree(deepLogs);

    expect(trace.isTruncated).toBe(false);
    expect(trace.totalComputeUnits).toBe(340);
    expect(trace.roots[0].children[0].children[0].children[0].programId).toBe('Level3');
    expect(trace.roots[0].status).toBe('success');
  });

  it('6. Deve preservar partial-failure sem perder o restante da árvore', () => {
    const partialFailureLogs = [
      'Program Router invoke [1]',
      'Program SwapA invoke [2]',
      'Program SwapA failed: insufficient balance',
      'Program SwapB invoke [2]',
      'Program SwapB consumed 200 of 200000 compute units',
      'Program SwapB success',
      'Program Router consumed 300 of 200000 compute units',
      'Program Router success',
    ];

    const trace = buildCPITree(partialFailureLogs);

    expect(trace.isTruncated).toBe(false);
    expect(trace.totalComputeUnits).toBe(500);
    expect(trace.roots[0].status).toBe('success');
    expect(trace.roots[0].children).toHaveLength(2);
    expect(trace.roots[0].children[0].status).toBe('failed');
    expect(trace.roots[0].children[1].status).toBe('success');
    expect(trace.roots[0].children[0].error?.rawMessage).toBe('insufficient balance');
  });
});