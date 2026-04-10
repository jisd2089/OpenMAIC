import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { readClassroom } from '@/lib/server/classroom-storage';
import { getClassroomDifySyncStatus } from '@/lib/server/publish/classroom-dify-sync';
import { handleRouteError } from '@/lib/server/route-error';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const classroom = await readClassroom(params.data.id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
    }

    const target = await getClassroomDifySyncStatus(params.data.id);
    return apiSuccess({
      classroomId: params.data.id,
      targets: [target],
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to retrieve classroom publish status');
  }
}
