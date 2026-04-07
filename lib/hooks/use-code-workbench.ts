'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CodeLanguage, CodePreviewMode } from '@/lib/code/runtime-catalog';
import { createDefaultDraft, readCodeDraftFromStorage, writeCodeDraftToStorage } from '@/lib/code/draft-storage';

const CODE_CLIENT_SESSION_STORAGE_KEY = 'openmaic:code-client-session-id';
const POLL_INTERVAL_MS = 1500;

export interface CodeRuntimeSummary {
  language: CodeLanguage;
  label: string;
  defaultFileName: string;
  previewMode: CodePreviewMode;
  available: boolean;
  disabledReason: string | null;
}

export interface CodeDraftFile {
  path: string;
  content: string;
}

export interface CodeDraftState {
  language: CodeLanguage;
  entrypoint: string;
  stdin: string;
  files: CodeDraftFile[];
  activeFilePath: string;
  updatedAt: number;
}

export interface CodeSessionSummary {
  id: string;
  classroomId: string;
  sceneId: string;
  clientSessionId: string;
  view: 'teacher' | 'student';
  providerMode: 'local' | 'aio';
  sandboxId: string | null;
  language: CodeLanguage;
  entrypoint: string;
  stdin: string;
  files: CodeDraftFile[];
  status: 'ready' | 'running' | 'released' | 'error';
  lastExecutionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodeExecutionArtifact {
  path: string;
  size: number;
}

export interface CodeExecutionSummary {
  id: string;
  classroomId: string;
  sessionId: string;
  language: CodeLanguage;
  entrypoint: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'stopped';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  previewMode: CodePreviewMode;
  previewUrl: string | null;
  previewToken: string | null;
  artifacts: CodeExecutionArtifact[];
  startedAt: string;
  finishedAt: string | null;
}

function getOrCreateClientSessionId() {
  if (typeof window === 'undefined') return null;
  const existing = window.sessionStorage.getItem(CODE_CLIENT_SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `code-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(CODE_CLIENT_SESSION_STORAGE_KEY, created);
  return created;
}

function buildDraftFromSession(session: CodeSessionSummary): CodeDraftState {
  return {
    language: session.language,
    entrypoint: session.entrypoint,
    stdin: session.stdin,
    files: session.files,
    activeFilePath: session.entrypoint,
    updatedAt: Date.now(),
  };
}

function isExecutionActive(execution: CodeExecutionSummary | null) {
  return execution?.status === 'queued' || execution?.status === 'running';
}

function normalizeDraft(next: CodeDraftState): CodeDraftState {
  const files = next.files.length > 0 ? next.files : createDefaultDraft(next.language).files;
  const activeFilePath =
    files.find((file) => file.path === next.activeFilePath)?.path ?? files[0]?.path ?? next.entrypoint;
  const entrypoint =
    files.find((file) => file.path === next.entrypoint)?.path ?? files[0]?.path ?? next.entrypoint;
  return {
    ...next,
    files,
    entrypoint,
    activeFilePath,
    updatedAt: Date.now(),
  };
}

async function parseJsonResponse(response: Response) {
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || 'Request failed');
  }
  return payload;
}

export function useCodeWorkbench(input: {
  classroomId: string;
  sceneId: string | null | undefined;
  view: 'teacher' | 'student';
  enabled?: boolean;
}) {
  const enabled = input.enabled !== false && Boolean(input.classroomId) && Boolean(input.sceneId);
  const [clientSessionId, setClientSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CodeSessionSummary | null>(null);
  const [draft, setDraft] = useState<CodeDraftState | null>(null);
  const [runtimes, setRuntimes] = useState<CodeRuntimeSummary[]>([]);
  const [execution, setExecution] = useState<CodeExecutionSummary | null>(null);

  useEffect(() => {
    setClientSessionId(getOrCreateClientSessionId());
  }, []);

  const persistLocalDraft = useCallback(
    (next: CodeDraftState) => {
      if (!clientSessionId || !input.sceneId) return;
      const normalized = normalizeDraft(next);
      setDraft(normalized);
      writeCodeDraftToStorage(
        input.classroomId,
        input.sceneId,
        clientSessionId,
        input.view,
        normalized,
      );
    },
    [clientSessionId, input.classroomId, input.sceneId, input.view],
  );

  const loadSession = useCallback(async () => {
    if (!enabled || !input.sceneId || !clientSessionId) {
      setSession(null);
      setDraft(null);
      setExecution(null);
      return;
    }

    setIsLoadingSession(true);
    setError(null);
    try {
      const storedDraft = readCodeDraftFromStorage(
        input.classroomId,
        input.sceneId,
        clientSessionId,
        input.view,
      );
      const response = await fetch(`/api/classroom/${input.classroomId}/code-sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sceneId: input.sceneId,
          clientSessionId,
          view: input.view,
          language: storedDraft?.language,
        }),
      });
      const payload = await parseJsonResponse(response);
      const nextSession = payload.session as CodeSessionSummary;
      const nextExecution = (payload.lastExecution as CodeExecutionSummary | null) ?? null;
      const nextRuntimes = (payload.runtimes as CodeRuntimeSummary[]) ?? [];
      const canReuseStoredDraft =
        storedDraft?.language === nextSession.language &&
        nextRuntimes.find((runtime) => runtime.language === storedDraft.language)?.available === true;
      setSession(nextSession);
      setExecution(nextExecution);
      setRuntimes(nextRuntimes);
      setDraft(normalizeDraft(canReuseStoredDraft ? storedDraft : buildDraftFromSession(nextSession)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load code session');
    } finally {
      setIsLoadingSession(false);
    }
  }, [clientSessionId, enabled, input.classroomId, input.sceneId, input.view]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!enabled || !session || !execution || !isExecutionActive(execution)) {
      setIsRunning(false);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/classroom/${input.classroomId}/code-sessions/${session.id}/executions/${execution.id}`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );
        const payload = await parseJsonResponse(response);
        if (cancelled) return;
        const nextExecution = payload.execution as CodeExecutionSummary;
        setExecution(nextExecution);
        setIsRunning(isExecutionActive(nextExecution));
        if (!isExecutionActive(nextExecution)) {
          setSession((current) =>
            current
              ? {
                  ...current,
                  status: 'ready',
                  lastExecutionId: nextExecution.id,
                }
              : current,
          );
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : 'Failed to poll execution');
        }
      }
    };

    setIsRunning(true);
    const timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, execution, input.classroomId, session]);

  const updateDraft = useCallback(
    (updater: (current: CodeDraftState) => CodeDraftState) => {
      setDraft((current) => {
        const base = current ?? createDefaultDraft('javascript');
        const next = normalizeDraft(updater(base));
        if (clientSessionId && input.sceneId) {
          writeCodeDraftToStorage(
            input.classroomId,
            input.sceneId,
            clientSessionId,
            input.view,
            next,
          );
        }
        return next;
      });
    },
    [clientSessionId, input.classroomId, input.sceneId, input.view],
  );

  const saveDraft = useCallback(async () => {
    if (!session || !draft) return null;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/classroom/${input.classroomId}/code-sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          language: draft.language,
          entrypoint: draft.entrypoint,
          stdin: draft.stdin,
          files: draft.files,
        }),
      });
      const payload = await parseJsonResponse(response);
      const nextSession = payload.session as CodeSessionSummary;
      setSession(nextSession);
      return nextSession;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save code draft');
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }, [draft, input.classroomId, session]);

  const runCode = useCallback(async () => {
    if (!session || !draft) return null;
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/classroom/${input.classroomId}/code-sessions/${session.id}/run`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            language: draft.language,
            entrypoint: draft.entrypoint,
            stdin: draft.stdin,
            files: draft.files,
          }),
        },
      );
      const payload = await parseJsonResponse(response);
      const nextSession = payload.session as CodeSessionSummary;
      const nextExecution = payload.execution as CodeExecutionSummary;
      setSession(nextSession);
      setExecution(nextExecution);
      setIsRunning(isExecutionActive(nextExecution));
      persistLocalDraft(draft);
      return nextExecution;
    } catch (runError) {
      setIsRunning(false);
      setError(runError instanceof Error ? runError.message : 'Failed to run code');
      throw runError;
    }
  }, [draft, input.classroomId, persistLocalDraft, session]);

  const stopExecution = useCallback(async () => {
    if (!session || !execution || !isExecutionActive(execution)) return null;
    try {
      const response = await fetch(
        `/api/classroom/${input.classroomId}/code-sessions/${session.id}/executions/${execution.id}/stop`,
        {
          method: 'POST',
        },
      );
      const payload = await parseJsonResponse(response);
      const nextExecution = payload.execution as CodeExecutionSummary;
      setExecution(nextExecution);
      setIsRunning(false);
      setSession((current) =>
        current
          ? {
              ...current,
              status: 'ready',
              lastExecutionId: nextExecution.id,
            }
          : current,
      );
      return nextExecution;
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : 'Failed to stop execution');
      throw stopError;
    }
  }, [execution, input.classroomId, session]);

  const setLanguage = useCallback(
    (language: CodeLanguage) => {
      persistLocalDraft({
        ...createDefaultDraft(language),
      });
    },
    [persistLocalDraft],
  );

  const activeFile = useMemo(
    () => draft?.files.find((file) => file.path === draft.activeFilePath) ?? null,
    [draft],
  );

  const runtime = useMemo(
    () => runtimes.find((item) => item.language === draft?.language) ?? null,
    [draft?.language, runtimes],
  );

  return {
    clientSessionId,
    isLoadingSession,
    isSaving,
    isRunning,
    error,
    session,
    draft,
    runtimes,
    runtime,
    execution,
    activeFile,
    loadSession,
    saveDraft,
    runCode,
    stopExecution,
    setLanguage,
    setEntrypoint: (entrypoint: string) =>
      updateDraft((current) => ({
        ...current,
        entrypoint,
      })),
    setStdin: (stdin: string) =>
      updateDraft((current) => ({
        ...current,
        stdin,
      })),
    setActiveFilePath: (activeFilePath: string) =>
      updateDraft((current) => ({
        ...current,
        activeFilePath,
      })),
    setActiveFileContent: (content: string) =>
      updateDraft((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.path === current.activeFilePath ? { ...file, content } : file
        ),
      })),
  };
}
