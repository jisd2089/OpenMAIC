import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { classroomRouteParamsSchema, patchClassroomSchema } from '@/lib/server/classroom/contracts';
import { buildRequestOrigin, isValidClassroomId, readClassroom } from '@/lib/server/classroom-storage';
import { patchClassroom } from '@/lib/server/classroom-patch';
import { handleRouteError } from '@/lib/server/route-error';
import { createLogger } from '@/lib/logger';
import { deleteClassroom } from '@/lib/server/classroom-delete';
import type {
  DeleteClassroomResponseData,
  PatchClassroomResponseData,
} from '@/lib/server/classroom/types';

const log = createLogger('Classroom Route');

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }
    const classroomId = params.data.id;
    if (!isValidClassroomId(classroomId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(classroomId);
    if (!classroom) {
      return apiError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
    }

    return apiSuccess({ classroom });
  } catch (error) {
    log.error('Failed to retrieve classroom by id', error);
    return handleRouteError(error, 'Failed to retrieve classroom');
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const parsed = await parseJsonRequestWithSchema(req, patchClassroomSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const result = await patchClassroom({
      classroomId: params.data.id,
      input: parsed.data,
      baseUrl: buildRequestOrigin(req),
    });

    return apiSuccess<PatchClassroomResponseData>(result.result);
  } catch (error) {
    log.error('Failed to save classroom changes', error);
    return handleRouteError(error, 'Failed to save classroom changes');
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }
    if (!isValidClassroomId(params.data.id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const result = await deleteClassroom({ classroomId: params.data.id });
    return apiSuccess<DeleteClassroomResponseData>(result);
  } catch (error) {
    log.error('Failed to delete classroom', error);
    return handleRouteError(error, 'Failed to delete classroom');
  }
}
