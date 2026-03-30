import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  classroomRevisionsDir,
  ensureClassroomRevisionsDir,
  readClassroom,
  persistClassroom,
  writeJsonFileAtomic,
} from '@/lib/server/classroom-storage';
import type {
  ClassroomRevisionRecord,
  ClassroomRevisionSource,
  ClassroomRevisionSummary,
} from '@/lib/server/classroom/types';
import { ServiceError } from '@/lib/server/service-error';
import { API_ERROR_CODES } from '@/lib/server/api-response';

function revisionFilePath(classroomId: string, revisionId: string) {
  return path.join(classroomRevisionsDir(classroomId), `${revisionId}.json`);
}

async function ensureRevisionDir(classroomId: string) {
  await ensureClassroomRevisionsDir();
  await fs.mkdir(classroomRevisionsDir(classroomId), { recursive: true });
}

export async function createClassroomRevision(params: {
  classroomId: string;
  source: ClassroomRevisionSource;
  summary?: string;
  createdBy?: string;
  stage: Stage;
  scenes: Scene[];
  revisionId?: string;
}): Promise<ClassroomRevisionRecord> {
  const revisionId = params.revisionId || nanoid(10);
  const createdAt = new Date().toISOString();
  const record: ClassroomRevisionRecord = {
    id: revisionId,
    classroomId: params.classroomId,
    source: params.source,
    summary: params.summary,
    createdAt,
    createdBy: params.createdBy,
    stage: params.stage,
    scenes: params.scenes,
  };

  await ensureRevisionDir(params.classroomId);
  await writeJsonFileAtomic(revisionFilePath(params.classroomId, revisionId), record);
  return record;
}

export async function importClassroomRevisions(
  classroomId: string,
  revisions: ClassroomRevisionRecord[],
): Promise<void> {
  if (revisions.length === 0) {
    return;
  }
  await ensureRevisionDir(classroomId);
  await Promise.all(
    revisions.map((revision) =>
      writeJsonFileAtomic(revisionFilePath(classroomId, revision.id), {
        ...revision,
        classroomId,
      }),
    ),
  );
}

export async function readClassroomRevision(
  classroomId: string,
  revisionId: string,
): Promise<ClassroomRevisionRecord | null> {
  try {
    const content = await fs.readFile(revisionFilePath(classroomId, revisionId), 'utf-8');
    return JSON.parse(content) as ClassroomRevisionRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function listAllClassroomRevisions(
  classroomId: string,
): Promise<ClassroomRevisionRecord[]> {
  try {
    const entries = await fs.readdir(classroomRevisionsDir(classroomId), { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) =>
          fs
            .readFile(path.join(classroomRevisionsDir(classroomId), entry.name), 'utf-8')
            .then((content) => JSON.parse(content) as ClassroomRevisionRecord),
        ),
    );
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function listClassroomRevisions(params: {
  classroomId: string;
  page: number;
  pageSize: number;
}): Promise<{ revisions: ClassroomRevisionSummary[]; total: number }> {
  const records = await listAllClassroomRevisions(params.classroomId);
  const start = (params.page - 1) * params.pageSize;
  const pageItems = records.slice(start, start + params.pageSize).map((record) => ({
    id: record.id,
    classroomId: record.classroomId,
    source: record.source,
    summary: record.summary,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
  }));
  return {
    revisions: pageItems,
    total: records.length,
  };
}

export async function restoreClassroomRevision(params: {
  classroomId: string;
  revisionId: string;
  baseUrl: string;
}): Promise<{ classroomId: string; revisionId: string; restoredAt: string }> {
  const revision = await readClassroomRevision(params.classroomId, params.revisionId);
  if (!revision) {
    throw new ServiceError(API_ERROR_CODES.REVISION_NOT_FOUND, 404, 'Revision not found');
  }

  const current = await readClassroom(params.classroomId);
  const restoredAt = new Date().toISOString();
  const stage: Stage = {
    ...revision.stage,
    id: params.classroomId,
    revisionId: revision.id,
    updatedAt: Date.now(),
    isDraft: false,
  };
  const scenes: Scene[] = revision.scenes.map((scene, index) => ({
    ...scene,
    stageId: params.classroomId,
    order: scene.order ?? index,
    updatedAt: Date.now(),
  }));

  await persistClassroom(
    {
      id: params.classroomId,
      stage,
      scenes,
    },
    params.baseUrl,
    { createdAt: current?.createdAt },
  );

  return {
    classroomId: params.classroomId,
    revisionId: revision.id,
    restoredAt,
  };
}
