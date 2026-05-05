/**
 * Local dev server that serves the static landing/demo pages and exposes a
 * small JSON API on top of the existing analysis pipeline (services/src).
 *
 * Run with:  npm run web
 *
 * The pipeline used here is the same as cli/src/commands/tx.ts — we just
 * package the result for the browser instead of rendering to a TUI.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchTransaction,
  parseLogsFromBundle,
  profileCU,
  buildCPITree,
  computeAccountDiffs,
  mergeAnalysis,
  analyzeTransaction,
  IdlCache,
  McpInsightProvider,
  type CPITree,
  type ParsedLogs,
} from '../services/src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3344', 10);
const WEB_DIR = __dirname;

// ───────────────────────────────────────────────────────────────────────────
// Pipeline helpers (mirrors cli/src/utils/pipeline.ts so we don't depend on it)
// ───────────────────────────────────────────────────────────────────────────

function toCPITree(trace: ReturnType<typeof buildCPITree>): CPITree {
  const toNode = (node: (typeof trace.roots)[number]): CPITree['root'][number] => ({
    programId: node.programId,
    programName: node.programId,
    depth: node.depth,
    status: node.status === 'success' ? 'success' : 'failed',
    cuConsumed: node.computeUnitsConsumed,
    children: node.children.map(toNode),
  });

  const metrics = { maxDepth: 0, count: 0 };
  const visit = (node: (typeof trace.roots)[number]) => {
    metrics.maxDepth = Math.max(metrics.maxDepth, node.depth);
    metrics.count += 1;
    for (const child of node.children) visit(child);
  };
  for (const root of trace.roots) visit(root);

  return {
    root: trace.roots.map(toNode),
    totalDepth: metrics.maxDepth,
    nodeCount: metrics.count,
  };
}

function toParsedLogs(
  logMessages: string[],
  parsed: ReturnType<typeof parseLogsFromBundle>,
): ParsedLogs {
  return {
    raw: logMessages,
    entries: [],
    byProgram: Object.keys(parsed.byProgram).map((programId) => ({
      programId,
      programName: programId,
      entries: [],
      cuConsumed: parsed.byProgram[programId]?.consumed,
    })) as any,
    errors: parsed.errors,
    totalLines: parsed.totalLines,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Build the JSON shape the demo page consumes
// ───────────────────────────────────────────────────────────────────────────

async function analyze(signature: string, network: 'mainnet' | 'devnet') {
  const idlCache = new IdlCache({ verbose: false });

  const rawBundle = await fetchTransaction(signature, network);

  const { Connection } = await import('@solana/web3.js');
  const { AnchorProvider } = await import('@coral-xyz/anchor');
  const rpcUrl =
    network === 'mainnet'
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com';
  const anchorProvider = new AnchorProvider(
    new Connection(rpcUrl, 'confirmed'),
    {
      publicKey: null,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    } as any,
    { commitment: 'confirmed' },
  );

  const parsedLogSummary = parseLogsFromBundle(rawBundle.logMessages);
  const cuProfile = profileCU(rawBundle.logMessages);
  const cpiTree = toCPITree(buildCPITree(rawBundle.logMessages));
  const accountDiffs = computeAccountDiffs(rawBundle);

  const analyzed = await mergeAnalysis(
    rawBundle,
    toParsedLogs(rawBundle.logMessages, parsedLogSummary),
    cuProfile,
    cpiTree,
    accountDiffs,
    { idlCache, anchorProvider },
  );

  const insightsReport = await analyzeTransaction(analyzed, [new McpInsightProvider()]);

  // Aggregate per-instruction CU into per-program CU for the flame graph.
  const cuByProgram: Record<string, { programId: string; programName: string; cuConsumed: number; count: number }> = {};
  for (const entry of cuProfile.perInstruction) {
    const k = entry.programId;
    if (!cuByProgram[k]) {
      cuByProgram[k] = {
        programId: entry.programId,
        programName: entry.programName || entry.programId,
        cuConsumed: 0,
        count: 0,
      };
    }
    cuByProgram[k].cuConsumed += entry.cuConsumed;
    cuByProgram[k].count += 1;
  }
  const programs = Object.values(cuByProgram).sort((a, b) => b.cuConsumed - a.cuConsumed);

  return {
    signature,
    network,
    success: !analyzed.raw.err,
    slot: analyzed.raw.slot,
    blockTime: analyzed.raw.blockTime,
    fee: analyzed.parsed.fee,
    computeUnits: {
      consumed: analyzed.raw.computeUnitsConsumed ?? cuProfile.totalConsumed,
      limit: cuProfile.totalLimit,
      utilizationPercent: cuProfile.utilizationPercent,
    },
    bottleneck: cuProfile.bottleneck,
    programs,
    cpiTree,
    accountDiffs,
    transfers: analyzed.transfers ?? [],
    insights: insightsReport.insights,
    primaryBottleneck: insightsReport.primaryBottleneck,
    estimatedSavings: insightsReport.totalEstimatedSavings,
    txType: analyzed.txType,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// HTTP server
// ───────────────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res: http.ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(body);
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string) {
  const safe = urlPath.replace(/\.\.+/g, '').replace(/^\/+/, '');
  const file = safe === '' ? 'landing.html' : safe;
  const full = path.join(WEB_DIR, file);

  try {
    const data = await fs.readFile(full);
    const ext = path.extname(full).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  } catch {
    send(res, 404, `not found: ${file}`, { 'Content-Type': 'text/plain' });
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return send(res, 400, 'bad request');

  if (req.method === 'OPTIONS') return send(res, 204, '');

  const url = new URL(req.url, `http://${req.headers.host}`);

  // health check
  if (url.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, version: '0.1.0' }), {
      'Content-Type': 'application/json',
    });
  }

  // analyze endpoint — accepts GET ?signature=...&network=... or POST {signature, network}
  if (url.pathname === '/api/analyze') {
    let signature = url.searchParams.get('signature') ?? '';
    let network = (url.searchParams.get('network') ?? 'mainnet') as 'mainnet' | 'devnet';

    if (req.method === 'POST') {
      const body = await new Promise<string>((resolve) => {
        let buf = '';
        req.on('data', (c) => (buf += c));
        req.on('end', () => resolve(buf));
      });
      try {
        const parsed = JSON.parse(body);
        signature = parsed.signature ?? signature;
        network = parsed.network ?? network;
      } catch {
        return send(res, 400, JSON.stringify({ error: 'invalid JSON body' }), {
          'Content-Type': 'application/json',
        });
      }
    }

    if (!signature || ![87, 88].includes(signature.length)) {
      return send(res, 400, JSON.stringify({ error: 'invalid signature' }), {
        'Content-Type': 'application/json',
      });
    }
    if (network !== 'mainnet' && network !== 'devnet') {
      return send(res, 400, JSON.stringify({ error: 'invalid network' }), {
        'Content-Type': 'application/json',
      });
    }

    try {
      const t0 = Date.now();
      const result = await analyze(signature, network);
      const tookMs = Date.now() - t0;
      console.log(`[analyze] ${signature.slice(0, 8)}…  ${tookMs}ms`);
      return send(res, 200, JSON.stringify({ ...result, tookMs }), {
        'Content-Type': 'application/json',
      });
    } catch (e: any) {
      console.error('[analyze] error:', e?.message ?? e);
      return send(res, 500, JSON.stringify({ error: e?.message ?? String(e) }), {
        'Content-Type': 'application/json',
      });
    }
  }

  // static files
  if (req.method === 'GET') {
    return serveStatic(req, res, url.pathname);
  }

  send(res, 405, 'method not allowed');
});

server.listen(PORT, () => {
  console.log(`\n  open dev server`);
  console.log(`  → http://localhost:${PORT}/landing.html`);
  console.log(`  → http://localhost:${PORT}/demo.html`);
  console.log(`  → POST /api/analyze  { signature, network }\n`);
});
