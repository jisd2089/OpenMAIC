/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response using Tavily search.
 */

import { searchWithTavily, formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';

const log = createLogger('WebSearch');

const webSearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  apiKey: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = await parseJsonRequestWithSchema(req, webSearchRequestSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }
    const { query, apiKey: clientApiKey } = parsed.data;

    const apiKey = resolveWebSearchApiKey(clientApiKey);
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        400,
        'Tavily API key is not configured. Set it in Settings → Web Search or set TAVILY_API_KEY env var.',
      );
    }

    const result = await searchWithTavily({ query, apiKey });
    const context = formatSearchResultsAsContext(result);

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context,
      query: result.query,
      responseTime: result.responseTime,
    });
  } catch (err) {
    log.error('[WebSearch] Error:', err);
    const message = err instanceof Error ? err.message : 'Web search failed';
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
