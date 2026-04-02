import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import { normalizeClassroomName } from '@/lib/classroom/name';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');
export const COURSE_EXPORTS_DIR = path.join(process.cwd(), 'data', 'course-exports');
export const COURSE_IMPORTS_DIR = path.join(process.cwd(), 'data', 'course-imports');
export const CLASSROOM_REVISIONS_DIR = path.join(process.cwd(), 'data', 'classroom-revisions');
export const CLASSROOM_REGENERATION_JOBS_DIR = path.join(
  process.cwd(),
  'data',
  'classroom-regeneration-jobs',
);

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function ensureCourseExportsDir() {
  await ensureDir(COURSE_EXPORTS_DIR);
}

export async function ensureCourseImportsDir() {
  await ensureDir(COURSE_IMPORTS_DIR);
}

export async function ensureClassroomRevisionsDir() {
  await ensureDir(CLASSROOM_REVISIONS_DIR);
}

export async function ensureClassroomRegenerationJobsDir() {
  await ensureDir(CLASSROOM_REGENERATION_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function classroomUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/classroom/${id}`;
}

export function classroomJsonPath(id: string): string {
  return path.join(CLASSROOMS_DIR, `${id}.json`);
}

export function classroomDir(id: string): string {
  return path.join(CLASSROOMS_DIR, id);
}

export function classroomMediaDir(id: string): string {
  return path.join(classroomDir(id), 'media');
}

export function classroomAudioDir(id: string): string {
  return path.join(classroomDir(id), 'audio');
}

export function classroomRevisionsDir(id: string): string {
  return path.join(CLASSROOM_REVISIONS_DIR, id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  try {
    const content = await fs.readFile(classroomJsonPath(id), 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
  options?: { createdAt?: string },
): Promise<PersistedClassroomData & { url: string }> {
  const normalizedStage: Stage = {
    ...data.stage,
    name: normalizeClassroomName(data.stage.name || 'Untitled Stage'),
  };

  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: normalizedStage,
    scenes: data.scenes,
    createdAt: options?.createdAt || new Date().toISOString(),
  };

  await ensureClassroomsDir();
  await writeJsonFileAtomic(classroomJsonPath(data.id), classroomData);

  return {
    ...classroomData,
    url: classroomUrl(baseUrl, data.id),
  };
}
