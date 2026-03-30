import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';
import { searchMemorySchema } from '@/lib/server/memory/contracts';
import { getMemoryService } from '@/lib/server/memory/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(request, searchMemorySchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const result = await getMemoryService().searchMemory(parsed.data);
    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to search memory');
  }
}
