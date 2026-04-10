import { promises as fs } from 'fs';
import path from 'path';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

export const CLASSROOM_PUBLISH_DIR = path.join(process.cwd(), 'data', 'classroom-publish');

export type ClassroomPublishStatus =
  | 'idle'
  | 'queued'
  | 'syncing'
  | 'indexing'
  | 'completed'
  | 'failed'
  | 'skipped';

export type ClassroomPublishTriggerSource =
  | 'generate'
  | 'regenerate'
  | 'publish'
  | 'manual';

export interface ClassroomDifyMetadata {
  classroom: string;
  type: string;
  title: string;
}

export interface ClassroomDifySyncRecord {
  classroomId: string;
  provider: 'dify';
  enabled: boolean;
  status: ClassroomPublishStatus;
  targetBaseUrl: string;
  datasetId: string;
  documentId: string | null;
  documentName: string | null;
  documentCreatedAt: string | null;
  triggerSource: ClassroomPublishTriggerSource;
  metadata: ClassroomDifyMetadata;
  batchId: string | null;
  contentHash: string | null;
  remoteIndexingStatus: string | null;
  lastAttemptAt: string | null;
  lastSyncedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

function recordPath(classroomId: string) {
  return path.join(CLASSROOM_PUBLISH_DIR, `${classroomId}.json`);
}

async function ensurePublishDir() {
  await fs.mkdir(CLASSROOM_PUBLISH_DIR, { recursive: true });
}

const recordLocks = new Map<string, Promise<void>>();

async function withRecordLock<T>(classroomId: string, fn: () => Promise<T>): Promise<T> {
  const prev = recordLocks.get(classroomId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  recordLocks.set(classroomId, next);

  try {
    await prev;
    return await fn();
  } finally {
    resolve!();
    if (recordLocks.get(classroomId) === next) {
      recordLocks.delete(classroomId);
    }
  }
}

export async function readClassroomDifySyncRecord(
  classroomId: string,
): Promise<ClassroomDifySyncRecord | null> {
  try {
    const content = await fs.readFile(recordPath(classroomId), 'utf-8');
    return JSON.parse(content) as ClassroomDifySyncRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeClassroomDifySyncRecord(record: ClassroomDifySyncRecord) {
  await ensurePublishDir();
  await writeJsonFileAtomic(recordPath(record.classroomId), record);
  return record;
}

export async function updateClassroomDifySyncRecord(
  classroomId: string,
  build: (existing: ClassroomDifySyncRecord | null) => ClassroomDifySyncRecord,
) {
  return withRecordLock(classroomId, async () => {
    const existing = await readClassroomDifySyncRecord(classroomId);
    const next = build(existing);
    await writeClassroomDifySyncRecord(next);
    return next;
  });
}
