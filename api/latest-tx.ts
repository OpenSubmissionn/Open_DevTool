import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as server from '../web/server.js';

// `web/server.ts` lives under the root package.json which has no `"type"`
// field, so it's transpiled as CJS. ESM-to-CJS named imports are checked
// statically by Node and fail on esbuild's barrel output, so we go through
// the namespace + `default` fallback instead.
const getLatestTx = (server as any).getLatestTx ?? (server as any).default?.getLatestTx;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    if (typeof getLatestTx !== 'function') {
      throw new Error('getLatestTx export not found on web/server module');
    }
    const result = await getLatestTx();
    res.status(200).json(result);
  } catch (e: any) {
    console.error('[latest-tx] error:', e?.message ?? e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
