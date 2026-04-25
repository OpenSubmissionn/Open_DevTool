import { describe, it, expect } from 'vitest';
import { buildCPITreeVisualLines } from './renderer';

type TestNode = {
  programId: string;
  programName: string;
  status: 'success' | 'failed' | 'truncated';
  cuConsumed?: number;
  children?: TestNode[];
};

describe('buildCPITreeVisualLines', () => {
  it('renders success tree with stable connectors', () => {
    const nodes: TestNode[] = [
      {
        programId: 'RootProgram',
        programName: 'Root Program',
        status: 'success',
        cuConsumed: 100,
        children: [
          {
            programId: 'ChildA',
            programName: 'Child A',
            status: 'success',
            cuConsumed: 20,
            children: [],
          },
          {
            programId: 'ChildB',
            programName: 'Child B',
            status: 'success',
            cuConsumed: 30,
            children: [],
          },
        ],
      },
    ];

    const lines = buildCPITreeVisualLines(nodes, null);
    expect(lines.join('\n')).toMatchInlineSnapshot(`
      "✓ Root Program (100 CU)
      ├── ✓ Child A (20 CU)
      └── ✓ Child B (30 CU)"
    `);
  });

  it('renders failed and truncated tags clearly', () => {
    const nodes: TestNode[] = [
      {
        programId: 'RootProgram',
        programName: 'Root Program',
        status: 'failed',
        cuConsumed: 90,
        children: [
          {
            programId: 'ChildTruncated',
            programName: 'Child Truncated',
            status: 'truncated',
            cuConsumed: 15,
            children: [],
          },
        ],
      },
    ];

    const lines = buildCPITreeVisualLines(nodes, null);
    expect(lines.join('\n')).toMatchInlineSnapshot(`
      "✗ Root Program (90 CU) [FAILED]
      └── ✗ Child Truncated (15 CU) [TRUNCATED]"
    `);
  });

  it('keeps deep-cpi alignment and bottleneck marker stable', () => {
    const nodes: TestNode[] = [
      {
        programId: 'Root',
        programName: 'Root',
        status: 'success',
        cuConsumed: 10,
        children: [
          {
            programId: 'L1',
            programName: 'Level 1',
            status: 'success',
            cuConsumed: 20,
            children: [
              {
                programId: 'L2',
                programName: 'Level 2',
                status: 'success',
                cuConsumed: 30,
                children: [
                  {
                    programId: 'HotProgram',
                    programName: 'Hot Program',
                    status: 'success',
                    cuConsumed: 120,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const lines = buildCPITreeVisualLines(nodes, {
      programId: 'HotProgram',
      cuConsumed: 120,
    });
    expect(lines.join('\n')).toMatchInlineSnapshot(`
      "✓ Root (10 CU)
      └── ✓ Level 1 (20 CU)
          └── ✓ Level 2 (30 CU)
              └── ✓ Hot Program (120 CU) [BOTTLENECK]"
    `);
  });
});
