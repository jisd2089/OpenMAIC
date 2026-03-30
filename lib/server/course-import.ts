import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { ServiceError } from '@/lib/server/service-error';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import { parseCoursePackageBuffer } from '@/lib/server/course-package';
import { persistClassroom } from '@/lib/server/classroom-storage';
import {
  extractCoursePackageAssets,
  rewriteClassroomAssetReferences,
} from '@/lib/server/classroom-assets';
import { importClassroomRevisions } from '@/lib/server/classroom-revision-store';
import type { ApplyCourseImportInput } from '@/lib/server/classroom/contracts';
import type {
  CourseImportJobResult,
  CourseImportValidationSummary,
} from '@/lib/server/classroom/types';
import type { Scene, Stage } from '@/lib/types/stage';
import type { ClassroomImportJob } from '@/lib/server/classroom-import-store';

export async function validateCourseImportPackage(job: ClassroomImportJob): Promise<{
  validation: CourseImportValidationSummary;
  extracted: ClassroomImportJob['extracted'];
}> {
  const buffer = await fs.readFile(job.uploadedFilePath);
  try {
    const parsed = await parseCoursePackageBuffer(buffer);
    return {
      validation: {
        manifest: parsed.manifest,
        warnings: [],
      },
      extracted: {
        stage: parsed.stage,
        scenes: parsed.scenes,
        context: parsed.context,
        revisions: parsed.revisions,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Unsupported course package version')) {
      throw new ServiceError(
        API_ERROR_CODES.IMPORT_PACKAGE_UNSUPPORTED_VERSION,
        400,
        message,
      );
    }
    throw new ServiceError(API_ERROR_CODES.IMPORT_PACKAGE_INVALID, 400, message);
  }
}

export async function applyCourseImportResult(params: {
  job: ClassroomImportJob;
  input: ApplyCourseImportInput;
  baseUrl: string;
}): Promise<CourseImportJobResult> {
  if (!params.job.extracted) {
    throw new ServiceError(
      API_ERROR_CODES.IMPORT_PACKAGE_INVALID,
      400,
      'Import job is not validated',
    );
  }

  if (params.job.result) {
    return params.job.result;
  }

  const parsed = await parseCoursePackageBuffer(await fs.readFile(params.job.uploadedFilePath));
  const newClassroomId = randomUUID();
  const now = Date.now();
  const sourceStage = params.job.extracted.stage;
  const stage = rewriteClassroomAssetReferences<Stage>(
    {
      ...sourceStage,
      id: newClassroomId,
      name: params.input.courseNameOverride || sourceStage.name,
      createdAt: now,
      updatedAt: now,
      editable: true,
    },
    parsed.manifest.courseId,
    newClassroomId,
  );
  const scenes = params.job.extracted.scenes.map((scene, index) =>
    rewriteClassroomAssetReferences<Scene>(
      {
        ...scene,
        stageId: newClassroomId,
        order: scene.order ?? index,
        createdAt: now,
        updatedAt: now,
      },
      parsed.manifest.courseId,
      newClassroomId,
    ),
  );

  const persisted = await persistClassroom(
    {
      id: newClassroomId,
      stage,
      scenes,
    },
    params.baseUrl,
  );

  await extractCoursePackageAssets(parsed.zip, newClassroomId);
  await importClassroomRevisions(
    newClassroomId,
    params.job.extracted.revisions.map((revision) => ({
      ...revision,
      classroomId: newClassroomId,
      stage: rewriteClassroomAssetReferences<Stage>(
        revision.stage,
        parsed.manifest.courseId,
        newClassroomId,
      ),
      scenes: rewriteClassroomAssetReferences<Scene[]>(
        revision.scenes,
        parsed.manifest.courseId,
        newClassroomId,
      ),
    })),
  );

  return {
    classroomId: persisted.id,
    url: persisted.url,
  };
}
