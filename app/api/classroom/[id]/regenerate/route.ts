import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { classroomRouteParamsSchema, createClassroomRegenerationJobSchema } from '@/lib/server/classroom/contracts';
import { readClassroom } from '@/lib/server/classroom-storage';
import { createClassroomRegenerationJob } from '@/lib/server/classroom-regeneration-store';
import { runClassroomRegenerationJob } from '@/lib/server/classroom-regeneration-runner';
import { handleRouteError } from '@/lib/server/route-error';
import type { CreateClassroomRegenerationJobResponseData } from '@/lib/server/classroom/types';

function resolveTargetSceneIds(input: {
  targetType: 'classroom' | 'scene' | 'selection';
  targetId?: string;
  allSceneIds: string[];
}) {
  if (input.targetType === 'classroom') {
    return input.allSceneIds;
  }
  if (input.targetType === 'scene') {
    return input.targetId ? [input.targetId] : [];
  }
  return input.targetId
    ? input.targetId
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }
    const parsed = await parseJsonRequestWithSchema(req, createClassroomRegenerationJobSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const classroom = await readClassroom(params.data.id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
    }

    const targetSceneIds = resolveTargetSceneIds({
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      allSceneIds: classroom.scenes.map((scene) => scene.id),
    });
    const jobId = nanoid(10);
    const job = await createClassroomRegenerationJob({
      jobId,
      classroomId: params.data.id,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      targetSceneIds,
      regenerateMode: parsed.data.regenerateMode,
      preserveManualEdits: parsed.data.preserveManualEdits,
      prompt: parsed.data.prompt,
      scopeId: parsed.data.scopeId,
      knowledgeBaseIds: parsed.data.knowledgeBaseIds,
      memoryIds: parsed.data.memoryIds,
    });

    after(() => runClassroomRegenerationJob(jobId));

    return apiSuccess<CreateClassroomRegenerationJobResponseData>({
      jobId,
      status: job.status,
      step: job.step,
      message: job.message,
    }, 202);
  } catch (error) {
    return handleRouteError(error, 'Failed to create classroom regeneration job');
  }
}
