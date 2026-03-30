import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { knowledgeBaseRouteParamsSchema, updateKnowledgeBaseSchema } from '@/lib/server/kb/contracts';
import { getKnowledgeBaseService } from '@/lib/server/kb/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = parseWithSchema(knowledgeBaseRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id } = parsedParams.data;
    const parsed = await parseJsonRequestWithSchema(request, updateKnowledgeBaseSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const knowledgeBase = await getKnowledgeBaseService().updateKnowledgeBase(id, parsed.data);
    return apiSuccess({ knowledgeBase });
  } catch (error) {
    return handleRouteError(error, 'Failed to update knowledge base');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = parseWithSchema(knowledgeBaseRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id } = parsedParams.data;
    const result = await getKnowledgeBaseService().deleteKnowledgeBase(id);
    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to delete knowledge base');
  }
}
