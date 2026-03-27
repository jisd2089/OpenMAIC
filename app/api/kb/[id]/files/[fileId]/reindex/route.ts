import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { knowledgeBaseFileRouteParamsSchema } from '@/lib/server/kb/contracts';
import { getKnowledgeBaseService } from '@/lib/server/kb/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const parsedParams = parseWithSchema(knowledgeBaseFileRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id, fileId } = parsedParams.data;
    const result = await getKnowledgeBaseService().reindexKnowledgeFile(id, fileId);
    return apiSuccess(result, 202);
  } catch (error) {
    return handleRouteError(error, 'Failed to reindex knowledge base file');
  }
}
