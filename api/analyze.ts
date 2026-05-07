import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyze } from '../web/server.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Accept both GET ?signature=... and POST { signature, network } so the
  // demo page's existing fetch shape (POST JSON) keeps working as-is.
  let signature = '';
  let network: 'mainnet' | 'devnet' = 'mainnet';

  if (req.method === 'GET') {
    signature = String(req.query.signature ?? '');
    network = (String(req.query.network ?? 'mainnet') as 'mainnet' | 'devnet');
  } else if (req.method === 'POST') {
    const body = req.body ?? {};
    signature = body.signature ?? '';
    network = body.network ?? 'mainnet';
  } else {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  if (!signature || ![87, 88].includes(signature.length)) {
    res.status(400).json({ error: 'invalid signature' });
    return;
  }
  if (network !== 'mainnet' && network !== 'devnet') {
    res.status(400).json({ error: 'invalid network' });
    return;
  }

  try {
    const t0 = Date.now();
    const result = await analyze(signature, network);
    const tookMs = Date.now() - t0;
    console.log(`[analyze] ${signature.slice(0, 8)}…  ${tookMs}ms`);
    res.status(200).json({ ...result, tookMs });
  } catch (e: any) {
    console.error('[analyze] error:', e?.message ?? e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
