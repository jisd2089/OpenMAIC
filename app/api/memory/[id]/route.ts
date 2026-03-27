import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { memoryNoteRouteParamsSchema, updateMemoryNoteSchema } from '@/lib/server/memory/contracts';
import { getMemoryService } from '@/lib/server/memory/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = parseWithSchema(memoryNoteRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id } = parsedParams.data;
    const memoryNote = await getMemoryService().getMemoryNote(id);
    return apiSuccess({ memoryNote });
  } catch (error) {
    return handleRouteError(error, 'Failed to load memory note');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = parseWithSchema(memoryNoteRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id } = parsedParams.data;
    const parsed = await parseJsonRequestWithSchema(request, updateMemoryNoteSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const memoryNote = await getMemoryService().updateMemoryNote(id, parsed.data);
    return apiSuccess({ memoryNote });
  } catch (error) {
    return handleRouteError(error, 'Failed to update memory note');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = parseWithSchema(memoryNoteRouteParamsSchema, await params);
    if (!parsedParams.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsedParams.error);
    }
    const { id } = parsedParams.data;
    const result = await getMemoryService().deleteMemoryNote(id);
    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to delete memory note');
  }
}
