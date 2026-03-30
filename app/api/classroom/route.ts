import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';

const classroomPersistSchema = z.object({
  stage: z
    .object({
      id: z.string().optional(),
    })
    .passthrough(),
  scenes: z.array(z.unknown()),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(request, classroomPersistSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }
    const { stage, scenes } = parsed.data;

    const id = stage.id || randomUUID();
    const baseUrl = buildRequestOrigin(request);

    const persisted = await persistClassroom(
      {
        id,
        stage: { ...stage, id } as Stage,
        scenes: scenes as Scene[],
      },
      baseUrl,
    );

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    return apiSuccess({ classroom });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
