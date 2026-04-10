import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { classroomRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { readClassroom } from '@/lib/server/classroom-storage';
import {
  enqueueClassroomDifySync,
} from '@/lib/server/publish/classroom-dify-sync';
import { getDifyConfig, isDifySyncConfigured } from '@/lib/server/publish/dify-config';
import { handleRouteError } from '@/lib/server/route-error';

const requestSchema = z.object({
  force: z.boolean().default(true),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const parsed = await parseJsonRequestWithSchema(req, requestSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const classroom = await readClassroom(params.data.id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
    }

    if (!isDifySyncConfigured(getDifyConfig())) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Dify publish is not enabled');
    }

    after(() =>
      enqueueClassroomDifySync({
        classroomId: params.data.id,
        triggerSource: 'manual',
        force: parsed.data.force,
      }),
    );

    return apiSuccess(
      {
        classroomId: params.data.id,
        provider: 'dify' as const,
        status: 'queued' as const,
        triggerSource: 'manual' as const,
      },
      202,
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to trigger Dify publish');
  }
}
