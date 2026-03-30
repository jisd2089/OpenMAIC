import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';
import { azureVoicesRequestSchema } from '@/lib/server/generation/contracts';
const log = createLogger('Azure Voices');

export const maxDuration = 30;

/**
 * Azure TTS Voice List API
 * Fetches available voices from Azure Speech Services
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(req, azureVoicesRequestSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }
    const { apiKey, baseUrl } = parsed.data;

    // Validate baseUrl against SSRF
    const ssrfError = validateUrlForSSRF(baseUrl);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }

    // Call Azure voices list endpoint; disable redirect following to prevent SSRF via redirect
    const response = await fetch(`${baseUrl}/cognitiveservices/voices/list`, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      return apiError('REDIRECT_NOT_ALLOWED', 403, 'Redirects are not allowed');
    }

    if (!response.ok) {
      const errorText = await response.text();
      return apiError(
        'UPSTREAM_ERROR',
        response.status,
        'Failed to fetch voices from Azure',
        errorText || response.statusText,
      );
    }

    const voices = await response.json();

    return apiSuccess({ voices });
  } catch (error) {
    log.error('API error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to fetch voices',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
