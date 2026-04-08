import type { CodeLanguage } from '@/lib/code/runtime-catalog';
import { createDefaultCodeFiles, getCodeLanguageCatalogEntry } from '@/lib/code/runtime-catalog';
import { getCodeSandboxAioSharedSandboxId } from '@/lib/server/code/config';
import { getClassroomCodeSandboxProvider } from '@/lib/server/code/provider';
import { getCodeRuntimeAvailability, listSupportedCodeRuntimes } from '@/lib/server/code/runtime-registry';
import {
  buildSharedAioSandboxId,
  buildStableCodeSessionId,
  buildStableSandboxId,
  readCodeExecution,
  readCodeSession,
  writeCodeExecution,
  writeCodeSession,
} from '@/lib/server/code/storage';
import { stopActiveExecution } from '@/lib/server/code/execution-manager';
import type { PersistedCodeExecution, PersistedCodeSession } from '@/lib/server/code/types';

function isTerminalExecutionStatus(status: PersistedCodeExecution['status']) {
  return (
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'timed_out' ||
    status === 'stopped'
  );
}

function selectAvailableLanguage(preferred?: CodeLanguage) {
  const runtimes = listSupportedCodeRuntimes();
  const available = runtimes.filter((runtime) => runtime.available);
  if (preferred) {
    const matched = available.find((runtime) => runtime.language === preferred);
    if (matched) {
      return matched.language;
    }
  }
  const fallback = available[0];
  if (!fallback) {
    throw new Error('No code runtimes are available in the current sandbox configuration');
  }
  return fallback.language;
}

function assertRuntimeAvailable(language: CodeLanguage) {
  const runtime = getCodeRuntimeAvailability(language);
  if (!runtime?.available) {
    throw new Error(
      runtime?.disabledReason || `${language} runtime is not available in the current sandbox`,
    );
  }
}

export async function createOrRestoreCodeSession(input: {
  classroomId: string;
  sceneId: string;
  clientSessionId: string;
  view: 'teacher' | 'student';
  language?: CodeLanguage;
}) {
  const language = selectAvailableLanguage(input.language ?? 'javascript');
  const sessionId = buildStableCodeSessionId(input);
  const provider = getClassroomCodeSandboxProvider();
  const providerMode = provider.mode;
  const sandboxId =
    providerMode === 'aio'
      ? buildSharedAioSandboxId(getCodeSandboxAioSharedSandboxId())
      : buildStableSandboxId(input);
  const existing = await readCodeSession(input.classroomId, sessionId);
  if (existing) {
    const normalizedLanguage = getCodeRuntimeAvailability(existing.language)?.available
      ? existing.language
      : language;
    const defaultFiles =
      normalizedLanguage !== existing.language ? createDefaultCodeFiles(normalizedLanguage) : null;
    const lastExecution = existing.lastExecutionId
      ? await readCodeExecution(input.classroomId, existing.id, existing.lastExecutionId)
      : null;
    const session: PersistedCodeSession = {
      ...existing,
      providerMode,
      sandboxId,
      language: normalizedLanguage,
      entrypoint:
        normalizedLanguage !== existing.language
          ? defaultFiles?.[0]?.path || existing.entrypoint
          : existing.entrypoint,
      files: normalizedLanguage !== existing.language ? defaultFiles || existing.files : existing.files,
      status:
        existing.status === 'released' ||
        (existing.status === 'running' && lastExecution && isTerminalExecutionStatus(lastExecution.status))
          ? 'ready'
          : existing.status,
      updatedAt: new Date().toISOString(),
    };
    await writeCodeSession(session);
    await provider.prepareSession?.({
      classroomId: input.classroomId,
      session,
    });
    return { session, lastExecution };
  }

  const defaultFiles = createDefaultCodeFiles(language);
  const session: PersistedCodeSession = {
    id: sessionId,
    classroomId: input.classroomId,
    sceneId: input.sceneId,
    clientSessionId: input.clientSessionId,
    view: input.view,
    providerMode,
    sandboxId,
    language,
    entrypoint: defaultFiles[0].path,
    stdin: '',
    files: defaultFiles,
    status: 'ready',
    lastExecutionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeCodeSession(session);
  await provider.prepareSession?.({
    classroomId: input.classroomId,
    session,
  });
  return { session, lastExecution: null };
}

export async function saveCodeSessionDraft(input: {
  classroomId: string;
  sessionId: string;
  language: CodeLanguage;
  entrypoint: string;
  stdin: string;
  files: Array<{ path: string; content: string }>;
}) {
  assertRuntimeAvailable(input.language);
  const session = await readCodeSession(input.classroomId, input.sessionId);
  if (!session) {
    throw new Error('Code session not found');
  }
  const updated: PersistedCodeSession = {
    ...session,
    language: input.language,
    entrypoint: input.entrypoint,
    stdin: input.stdin,
    files: input.files,
    status: session.status === 'released' ? 'ready' : session.status,
    updatedAt: new Date().toISOString(),
  };
  await writeCodeSession(updated);
  return updated;
}

export async function runCodeSession(input: {
  classroomId: string;
  sessionId: string;
  language: CodeLanguage;
  entrypoint: string;
  stdin: string;
  files: Array<{ path: string; content: string }>;
  origin: string;
}) {
  assertRuntimeAvailable(input.language);
  const session = await saveCodeSessionDraft({
    classroomId: input.classroomId,
    sessionId: input.sessionId,
    language: input.language,
    entrypoint: input.entrypoint,
    stdin: input.stdin,
    files: input.files,
  });

  const runningSession: PersistedCodeSession = {
    ...session,
    providerMode: getClassroomCodeSandboxProvider().mode,
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
  await writeCodeSession(runningSession);

  const provider = getClassroomCodeSandboxProvider();
  const execution = await provider.runSession({
    classroomId: input.classroomId,
    session: runningSession,
    origin: input.origin,
  });

  const completedSession: PersistedCodeSession = {
    ...runningSession,
    status: execution.status === 'running' ? 'running' : 'ready',
    lastExecutionId: execution.id,
    updatedAt: new Date().toISOString(),
  };
  await writeCodeSession(completedSession);

  return { session: completedSession, execution };
}

export async function releaseCodeSession(input: { classroomId: string; sessionId: string }) {
  const session = await readCodeSession(input.classroomId, input.sessionId);
  if (!session) {
    throw new Error('Code session not found');
  }
  await getClassroomCodeSandboxProvider().releaseSession?.({
    classroomId: input.classroomId,
    session,
  });
  const updated: PersistedCodeSession = {
    ...session,
    status: 'released',
    updatedAt: new Date().toISOString(),
  };
  await writeCodeSession(updated);
  return updated;
}

export async function stopCodeExecution(input: {
  classroomId: string;
  sessionId: string;
  executionId: string;
}) {
  const execution = await readCodeExecution(input.classroomId, input.sessionId, input.executionId);
  if (!execution) {
    throw new Error('Code execution not found');
  }
  const session = await readCodeSession(input.classroomId, input.sessionId);
  const stopped = stopActiveExecution(input.executionId);
  const updated: PersistedCodeExecution = stopped
    ? {
        ...execution,
        status: 'stopped',
        exitCode: execution.exitCode,
        finishedAt: new Date().toISOString(),
      }
    : execution;
  await writeCodeExecution(updated);
  if (session && (updated.status === 'stopped' || isTerminalExecutionStatus(updated.status))) {
    await writeCodeSession({
      ...session,
      status: 'ready',
      lastExecutionId: updated.id,
      updatedAt: new Date().toISOString(),
    });
  }
  return updated;
}

export function getDefaultEntrypoint(language: CodeLanguage) {
  return getCodeLanguageCatalogEntry(language).defaultFileName;
}
