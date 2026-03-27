import { NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { knowledgeFileRouteParamsSchema } from '@/lib/server/kb/contracts';
import { getKnowledgeBaseService } from '@/lib/server/kb/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const parsedParams = parseWithSchema(knowledgeFileRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { fileId } = parsedParams.data;
    return await getKnowledgeBaseService().getKnowledgeFilePoster(fileId, request);
  } catch (error) {
    return handleRouteError(error, 'Failed to read knowledge file poster');
  }
}
