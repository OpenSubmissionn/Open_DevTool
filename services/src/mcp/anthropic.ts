/**
 * Direct-to-Anthropic client for AI insights. The CLI uses the end user's
 * own ANTHROPIC_API_KEY (free $5 signup credit, then pay-per-use). When the
 * key is missing, invalid, rate-limited, or out of credit, the caller falls
 * back to rule-based insights and surfaces a contextual message.
 */
import type { MCPPayload } from './client';

export interface AnthropicResult {
  suggestions: string[];
  /** Surface-level reason when degraded (rendered as warn in the CLI). */
  degraded?: 'no_key' | 'rate_limit' | 'no_credit' | 'auth' | 'upstream' | 'parse';
  message?: string;
}

export function buildPrompt(p: MCPPayload): string {
  const tree = p.cpiTreeStructure;
  const node = p.bottleneckNode;
  const diffs = (p.detailedAccountDiffs ?? [])
    .slice(0, 5)
    .map(
      (d) =>
        `  - ${d.pubkeyShort} (${d.role}): ${d.solDelta} SOL` +
        (d.tokenDeltas.length
          ? `, tokens: ${d.tokenDeltas
              .map((t) => `${t.uiDelta} ${t.symbol ?? t.mint.slice(0, 8)}`)
              .join(', ')}`
          : '')
    )
    .join('\n');
  const patterns = (p.similarPatterns ?? [])
    .map((s) => `  - ${s.programName}: ${s.optimization}`)
    .join('\n');

  return `You are a senior Solana program engineer specialized in compute-unit (CU) optimization, transaction reliability, and on-chain economics. Analyze ONE transaction and produce 3 to 5 concrete, actionable optimization suggestions specific to it.

KNOWLEDGE BASE — apply these techniques only when relevant to the data below. Cite numbers when you can.

  Anchor framework — https://book.anchor-lang.com
  - Store canonical PDA bumps in account state; reusing them via \`bump = vault.bump\` saves ~1,500 CU per access vs find_program_address.
  - Prefer \`has_one\` and \`constraint\` over manual key comparisons in handler code.
  - Use \`LazyAccount\` (Anchor 0.30+) for read-heavy accounts: ~5,000 CU saved on large structs.
  - Avoid \`init_if_needed\`: permits reinitialization attacks. Pre-create accounts in a separate ix.
  - After any CPI that mutates an Anchor account, call \`ctx.accounts.x.reload()?\` or you will read stale data.
  - Each \`msg!()\` costs 150–500 CU; remove from hot paths or feature-gate behind \`#[cfg(feature = "debug")]\`.

  Compute budget — https://solana.com/docs/core/fees
  - Default ix limit: 200,000 CU. Default tx limit: 1,400,000 CU. Hard cap per tx: 1,400,000.
  - \`ComputeBudgetProgram::setComputeUnitLimit\` should match simulated CU + 10–20% buffer. Over-requesting wastes the priority-fee budget (priority fee = price × limit).
  - Set price via \`setComputeUnitPrice\`; fetch a sane percentile from \`getRecentPrioritizationFees\` (Helius/Triton expose this).

  SPL Token / Token-2022 — https://spl.solana.com/token
  - transfer: ~3,500 CU; transferChecked: ~4,500 CU; mint: ~5,000 CU; createAssociatedTokenAccount: ~25,000 CU.
  - Cache ATAs — never recreate. Use \`getAssociatedTokenAddressSync\` once and store.
  - Token-2022 transfer hooks add 5,000–20,000 CU depending on the hook program. Disable unused extensions.

  CPI patterns
  - Each CPI adds ~1,000 CU framing overhead regardless of payload.
  - Batch operations into a single ix when the protocol supports it (e.g. Jupiter route vs N separate swaps; Squads single multisig ix).
  - Validate the target program ID before \`invoke\` — bad targets cost a full revert.

  DEX-specific
  - Jupiter v6: prefer \`exactIn\` over \`exactOut\` (lower CU and better routing). Cap \`maxAccounts\` in the quote (default 64 → tighten to 32 when slippage allows).
  - Orca Whirlpool: each tick crossing costs ~5,000 CU — pre-check \`tickArrays\` before wide-range swaps.
  - Raydium AMM v4: pre-validate pool state to bail before invoking; mid-tx failures revert the whole tx.

  Reliability — https://www.helius.dev/blog/how-to-land-transactions-on-solana
  - Always \`simulateTransaction\` before \`sendTransaction\`: gives exact CU and flushes obvious errors before paying.
  - Retry policy: escalate \`processed → confirmed → finalized\`. Don't retry on \`ProgramFailedToComplete\` or \`AccountNotFound\` — they're terminal.
  - Use durable nonces for time-sensitive sequential txs to bypass blockhash expiry (~150 slot window).

  Native Rust / Pinocchio — https://github.com/anza-xyz/pinocchio
  - Pinocchio: zero-copy access, no_std, no heap. ~80–95% CU reduction vs Anchor for hot paths.
  - Always store the canonical bump; \`Pubkey::create_program_address\` with stored bump is ~50 CU vs \`find_program_address\` at ~1,500–10,000 CU.

TRANSACTION DATA
- Bottleneck program: ${p.bottleneckProgram} (${p.cuConsumed} CU total consumed)
- Dominant instruction: ${p.instructionName}
- CPI depth: ${p.cpiDepth}${tree ? ` | nodes: ${tree.totalNodes} | branching factor: ${tree.branchingFactor.toFixed(2)} | distinct programs: ${tree.uniquePrograms}` : ''}
${node ? `- Bottleneck node: ${node.programName} consumed ${node.cuConsumed} CU (${node.utilizationPercent.toFixed(1)}% of total), status: ${node.status ?? 'unknown'}` : ''}
- Parsed errors: ${p.parsedErrors.length ? p.parsedErrors.join(' | ') : 'none'}
- Logs: ${p.logSummary}

ACCOUNT DIFFS
${diffs || '  (no relevant diffs)'}

KNOWN PATTERNS FOR THIS BOTTLENECK
${patterns || '  (no matching pattern in registry)'}

OUTPUT RULES
- Return ONLY a JSON object: { "suggestions": ["...", "..."] }
- 3 to 5 entries.
- Each suggestion: 1 line, English, max 200 chars.
- Be SPECIFIC to this tx — cite the bottleneck program name, the CU number, the CPI depth, etc. Never give generic advice that could apply to any transaction.
- Don't repeat facts already visible in the data; focus on what the developer should DO next.
- No markdown, no commentary, no text outside the JSON.`;
}

export async function callAnthropic(
  payload: MCPPayload,
  apiKey: string,
  model: string,
  signal: AbortSignal
): Promise<AnthropicResult> {
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildPrompt(payload) }],
      }),
      signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { suggestions: [], degraded: 'upstream', message: msg };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      return {
        suggestions: [],
        degraded: 'auth',
        message: 'ANTHROPIC_API_KEY inválida ou sem permissão.',
      };
    }
    if (response.status === 429) {
      return {
        suggestions: [],
        degraded: 'rate_limit',
        message: 'Anthropic rate limit atingido. Aguarde alguns segundos e tente de novo.',
      };
    }
    if (response.status === 400 && /credit/i.test(text)) {
      return {
        suggestions: [],
        degraded: 'no_credit',
        message:
          'Créditos da Anthropic esgotados nesta conta. Recarregue em console.anthropic.com.',
      };
    }
    return {
      suggestions: [],
      degraded: 'upstream',
      message: `HTTP ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  let data: { content?: Array<{ text?: string }> };
  try {
    data = (await response.json()) as { content?: Array<{ text?: string }> };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { suggestions: [], degraded: 'parse', message: msg };
  }

  const text = data.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { suggestions: [], degraded: 'parse', message: 'Resposta sem JSON válido.' };
  }

  try {
    const parsed = JSON.parse(match[0]) as { suggestions?: unknown };
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string')
      : [];
    return { suggestions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { suggestions: [], degraded: 'parse', message: msg };
  }
}
