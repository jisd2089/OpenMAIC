import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';
import { searchKnowledgeBaseSchema } from '@/lib/server/kb/contracts';
import { getKnowledgeBaseService } from '@/lib/server/kb/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(request, searchKnowledgeBaseSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const result = await getKnowledgeBaseService().searchKnowledgeBase(parsed.data);
    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to search knowledge base');
  }
}
