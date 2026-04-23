import { describe, it, expect } from 'vitest';
import { buildCPITree } from '../../src/analysis/cpiTreeBuilder';

describe('CPI Tree Builder (Task 1.4.1 - Nível Sênior)', () => {
  
  it('1. Deve processar uma árvore profunda com múltiplos filhos (siblings) e erros mistos', () => {
    const massiveLogs = [
      'Program 1111 invoke [1]',
      'Program log: Iniciando tx principal',
      
      // Primeiro filho (Sucesso)
      'Program 2222 invoke [2]',
      'Program log: Filho 1 processando',
      'Program 2222 consumed 500 of 200000 compute units',
      'Program 2222 success',
      
      // Segundo filho (Falha) que chama um Neto (Sucesso)
      'Program 3333 invoke [2]',
      'Program log: Filho 2 abriu',
      'Program 4444 invoke [3]',
      'Program data: base64/xxx=',
      'Program 4444 consumed 1000 of 200000 compute units',
      'Program 4444 success',
      'Program 3333 failed: custom program error: 0x10', // Filho 2 morre após o Neto rodar
      
      // Pai finaliza com erro porque o Filho 2 falhou
      'Program 1111 consumed 5000 of 200000 compute units',
      'Program 1111 failed: custom program error: 0x1'
    ];

    const trace = buildCPITree(massiveLogs);

    // Validações Globais
    expect(trace.totalComputeUnits).toBe(6500); // 500 + 1000 + 5000
    expect(trace.isTruncated).toBe(false);
    expect(trace.roots.length).toBe(1);

    const root = trace.roots[0];
    expect(root.programId).toBe('1111');
    expect(root.status).toBe('failed');
    expect(root.children.length).toBe(2); // Pai tem 2 filhos (2222 e 3333)

    // Valida Filho 1
    const child1 = root.children[0];
    expect(child1.programId).toBe('2222');
    expect(child1.status).toBe('success');
    expect(child1.computeUnitsConsumed).toBe(500);

    // Valida Filho 2 e Neto
    const child2 = root.children[1];
    expect(child2.programId).toBe('3333');
    expect(child2.status).toBe('failed');
    expect(child2.error?.code).toBe('0x10');
    expect(child2.children.length).toBe(1); // Filho 2 tem 1 neto

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
      'Program log: Vai cortar agora...'
      // Sem logs de 'success' ou 'failed'
    ];

    const trace = buildCPITree(truncatedLogs);

    expect(trace.isTruncated).toBe(true); // O teste crucial
    expect(trace.roots[0].status).toBe('truncated');
    expect(trace.roots[0].children[0].programId).toBe('BBBB');
    expect(trace.roots[0].children[0].status).toBe('truncated');
  });

  it('3. Deve lidar com falhas imediatas sem consumo de CU', () => {
    const fastFailLogs = [
      'Program FFFF invoke [1]',
      'Program FFFF failed: invalid account data'
    ];

    const trace = buildCPITree(fastFailLogs);

    expect(trace.totalComputeUnits).toBe(0);
    expect(trace.roots[0].status).toBe('failed');
    expect(trace.roots[0].error?.rawMessage).toBe('invalid account data');
    expect(trace.roots[0].error?.code).toBeUndefined(); // Não tem código hexadecimal aqui
  });
});