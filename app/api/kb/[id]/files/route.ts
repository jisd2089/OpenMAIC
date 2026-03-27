import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema, searchParamsToObject } from '@/lib/server/http-validation';
import {
  knowledgeBaseRouteParamsSchema,
  listKnowledgeFilesQuerySchema,
  uploadKnowledgeFileFormSchema,
} from '@/lib/server/kb/contracts';
import { getKnowledgeBaseService } from '@/lib/server/kb/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = parseWithSchema(knowledgeBaseRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id } = parsedParams.data;
    const parsed = parseWithSchema(
      listKnowledgeFilesQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const result = await getKnowledgeBaseService().listKnowledgeFiles(id, parsed.data);
    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to list knowledge base files');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = parseWithSchema(knowledgeBaseRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id } = parsedParams.data;
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: file');
    }

    const parsed = parseWithSchema(
      uploadKnowledgeFileFormSchema,
      Object.fromEntries(formData.entries()),
    );
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const knowledgeFile = await getKnowledgeBaseService().uploadKnowledgeFile({
      knowledgeBaseId: id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      assetType: parsed.data.assetType,
      autoIngest: parsed.data.autoIngest,
      file,
    });

    return apiSuccess({ knowledgeFile }, 201);
  } catch (error) {
    return handleRouteError(error, 'Failed to upload knowledge base file');
  }
}
