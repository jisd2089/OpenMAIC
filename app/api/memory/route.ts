import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema, searchParamsToObject } from '@/lib/server/http-validation';
import {
  createMemoryNoteSchema,
  listMemoryNotesQuerySchema,
} from '@/lib/server/memory/contracts';
import { getMemoryService } from '@/lib/server/memory/service';
import { handleRouteError } from '@/lib/server/route-error';

export async function GET(request: NextRequest) {
  try {
    const parsed = parseWithSchema(
      listMemoryNotesQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const result = await getMemoryService().listMemoryNotes(parsed.data);
    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to list memory notes');
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(request, createMemoryNoteSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const memoryNote = await getMemoryService().createMemoryNote(parsed.data);
    return apiSuccess({ memoryNote }, 201);
  } catch (error) {
    return handleRouteError(error, 'Failed to create memory note');
  }
}
