import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import type { Dirent } from 'fs';
import path from 'path';
import type { PersistedCodeExecution, PersistedCodeSession } from '@/lib/server/code/types';
import { ensureClassroomsDir, writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import { getCodeSandboxWorkspaceRoot } from '@/lib/server/code/config';

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function classroomCodeDir(classroomId: string) {
  return path.join(getCodeSandboxWorkspaceRoot(), 'classrooms', classroomId, 'code');
}

export function classroomCodeSessionsDir(classroomId: string) {
  return path.join(classroomCodeDir(classroomId), 'sessions');
}

export function codeSessionDir(classroomId: string, sessionId: string) {
  return path.join(classroomCodeSessionsDir(classroomId), sessionId);
}

export function codeSessionWorkspaceDir(classroomId: string, sessionId: string) {
  return path.join(codeSessionDir(classroomId, sessionId), 'workspace');
}

export function codeSessionUploadsDir(classroomId: string, sessionId: string) {
  return path.join(codeSessionDir(classroomId, sessionId), 'uploads');
}

export function codeSessionOutputsDir(classroomId: string, sessionId: string) {
  return path.join(codeSessionDir(classroomId, sessionId), 'outputs');
}

export function codeSessionMetaDir(classroomId: string, sessionId: string) {
  return path.join(codeSessionDir(classroomId, sessionId), 'meta');
}

export function codeSessionJsonPath(classroomId: string, sessionId: string) {
  return path.join(codeSessionMetaDir(classroomId, sessionId), 'session.json');
}

export function codeExecutionsDir(classroomId: string, sessionId: string) {
  return path.join(codeSessionMetaDir(classroomId, sessionId), 'executions');
}

export function codeExecutionJsonPath(
  classroomId: string,
  sessionId: string,
  executionId: string,
) {
  return path.join(codeExecutionsDir(classroomId, sessionId), `${executionId}.json`);
}

export async function ensureCodeSessionDirs(classroomId: string, sessionId: string) {
  await ensureClassroomsDir();
  await ensureDir(codeSessionWorkspaceDir(classroomId, sessionId));
  await ensureDir(codeSessionUploadsDir(classroomId, sessionId));
  await ensureDir(codeSessionOutputsDir(classroomId, sessionId));
  await ensureDir(codeExecutionsDir(classroomId, sessionId));
}

export function buildStableCodeSessionId(input: {
  classroomId: string;
  sceneId: string;
  clientSessionId: string;
  view: 'teacher' | 'student';
}) {
  return createHash('sha256')
    .update(
      `${input.classroomId}:${input.sceneId}:${input.clientSessionId}:${input.view}`,
      'utf8',
    )
    .digest('base64url')
    .slice(0, 16);
}

export function buildSharedAioSandboxId(sharedSandboxId: string) {
  return sharedSandboxId.trim() || 'sandbox_aio_global';
}

export function buildStableSandboxId(input: {
  classroomId: string;
  sceneId: string;
  clientSessionId: string;
  view: 'teacher' | 'student';
}) {
  return `sandbox_${buildStableCodeSessionId(input)}`;
}

export async function readCodeSession(
  classroomId: string,
  sessionId: string,
): Promise<PersistedCodeSession | null> {
  try {
    const content = await fs.readFile(codeSessionJsonPath(classroomId, sessionId), 'utf8');
    return JSON.parse(content) as PersistedCodeSession;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function listPersistedCodeSessions(): Promise<PersistedCodeSession[]> {
  const root = getCodeSandboxWorkspaceRoot();
  const classroomsRoot = path.join(root, 'classrooms');
  let classroomEntries: Dirent[];
  try {
    classroomEntries = await fs.readdir(classroomsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const sessions: PersistedCodeSession[] = [];
  for (const classroomEntry of classroomEntries) {
    if (!classroomEntry.isDirectory()) continue;
    const sessionsDir = classroomCodeSessionsDir(classroomEntry.name);
    let sessionEntries: Dirent[];
    try {
      sessionEntries = await fs.readdir(sessionsDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) continue;
      const session = await readCodeSession(classroomEntry.name, sessionEntry.name);
      if (session) {
        sessions.push(session);
      }
    }
  }

  return sessions;
}

export async function writeCodeSession(session: PersistedCodeSession) {
  await ensureCodeSessionDirs(session.classroomId, session.id);
  await writeJsonFileAtomic(codeSessionJsonPath(session.classroomId, session.id), session);
}

export async function readCodeExecution(
  classroomId: string,
  sessionId: string,
  executionId: string,
): Promise<PersistedCodeExecution | null> {
  try {
    const content = await fs.readFile(codeExecutionJsonPath(classroomId, sessionId, executionId), 'utf8');
    return JSON.parse(content) as PersistedCodeExecution;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeCodeExecution(execution: PersistedCodeExecution) {
  await ensureCodeSessionDirs(execution.classroomId, execution.sessionId);
  await writeJsonFileAtomic(
    codeExecutionJsonPath(execution.classroomId, execution.sessionId, execution.id),
    execution,
  );
}

export async function writeSessionFiles(
  classroomId: string,
  sessionId: string,
  files: Array<{ path: string; content: string }>,
) {
  const workspaceDir = codeSessionWorkspaceDir(classroomId, sessionId);
  await ensureDir(workspaceDir);

  await fs.rm(workspaceDir, { recursive: true, force: true });
  await ensureDir(workspaceDir);

  for (const file of files) {
    if (!file.path || file.path.includes('..')) {
      throw new Error('Invalid file path');
    }
    const target = path.join(workspaceDir, file.path);
    const normalized = path.normalize(target);
    if (!normalized.startsWith(path.normalize(workspaceDir))) {
      throw new Error('Invalid file path');
    }
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, file.content, 'utf8');
  }
}

export async function listExecutionArtifacts(
  classroomId: string,
  sessionId: string,
  executionId: string,
): Promise<Array<{ path: string; size: number }>> {
  const root = path.join(codeSessionOutputsDir(classroomId, sessionId), executionId);
  async function walk(dir: string, prefix = ''): Promise<Array<{ path: string; size: number }>> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const results: Array<{ path: string; size: number }> = [];
    for (const entry of entries) {
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walk(fullPath, nextPrefix)));
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        results.push({ path: nextPrefix.replaceAll('\\', '/'), size: stat.size });
      }
    }
    return results;
  }

  return walk(root);
}
