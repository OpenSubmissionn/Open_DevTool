import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getLatestTx } from '../web/server';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const result = await getLatestTx();
    res.status(200).json(result);
  } catch (e: any) {
    console.error('[latest-tx] error:', e?.message ?? e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
