import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema, searchParamsToObject } from '@/lib/server/http-validation';
import {
  classroomRouteParamsSchema,
  createClassroomRevisionSchema,
  listClassroomRevisionsQuerySchema,
} from '@/lib/server/classroom/contracts';
import { handleRouteError } from '@/lib/server/route-error';
import { readClassroom } from '@/lib/server/classroom-storage';
import { createClassroomRevision, listClassroomRevisions } from '@/lib/server/classroom-revision-store';
import type {
  CreateClassroomRevisionResponseData,
  ListClassroomRevisionsResponseData,
} from '@/lib/server/classroom/types';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }
    const query = parseWithSchema(
      listClassroomRevisionsQuerySchema,
      searchParamsToObject(req.nextUrl.searchParams),
    );
    if (!query.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, query.error);
    }

    const result = await listClassroomRevisions({
      classroomId: params.data.id,
      page: query.data.page,
      pageSize: query.data.pageSize,
    });

    return apiSuccess<ListClassroomRevisionsResponseData>({
      revisions: result.revisions,
      page: query.data.page,
      pageSize: query.data.pageSize,
      total: result.total,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to list classroom revisions');
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }
    const parsed = await parseJsonRequestWithSchema(req, createClassroomRevisionSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const classroom = await readClassroom(params.data.id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
    }

    const revision = await createClassroomRevision({
      classroomId: params.data.id,
      source: parsed.data.source,
      summary: parsed.data.summary,
      stage: classroom.stage,
      scenes: classroom.scenes,
    });

    return apiSuccess<CreateClassroomRevisionResponseData>({
      revision: {
        id: revision.id,
        classroomId: revision.classroomId,
        source: revision.source,
        summary: revision.summary,
        createdAt: revision.createdAt,
        createdBy: revision.createdBy,
      },
    }, 201);
  } catch (error) {
    return handleRouteError(error, 'Failed to create classroom revision');
  }
}
