/**
 * Groq client for AI insights — free alternative to Anthropic.
 * Groq has a generous free tier (~30 req/min, no credit card required) and
 * runs Llama 3.3 70B with very low latency. Same response shape as the
 * Anthropic adapter so the caller can swap providers transparently.
 */
import { buildPrompt } from './anthropic.js';
import type { AnthropicResult } from './anthropic.js';
import type { MCPPayload } from './client.js';

export async function callGroq(
  payload: MCPPayload,
  apiKey: string,
  model: string,
  signal: AbortSignal
): Promise<AnthropicResult> {
  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildPrompt(payload) }],
        response_format: { type: 'json_object' },
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
        message: 'GROQ_API_KEY invalid or lacks permission.',
      };
    }
    if (response.status === 429) {
      return {
        suggestions: [],
        degraded: 'rate_limit',
        message: 'Groq rate limit reached. Wait a few seconds and try again.',
      };
    }
    return {
      suggestions: [],
      degraded: 'upstream',
      message: `HTTP ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = (await response.json()) as typeof data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { suggestions: [], degraded: 'parse', message: msg };
  }

  const text = data.choices?.[0]?.message?.content ?? '';
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
