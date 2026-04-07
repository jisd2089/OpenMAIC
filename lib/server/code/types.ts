import type { CodeLanguage, CodePreviewMode } from '@/lib/code/runtime-catalog';

export type CodeSessionStatus = 'ready' | 'running' | 'released' | 'error';
export type CodeExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'stopped';

export interface PersistedCodeFile {
  path: string;
  content: string;
}

export interface PersistedCodeSession {
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
  files: PersistedCodeFile[];
  status: CodeSessionStatus;
  lastExecutionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedCodeArtifact {
  path: string;
  size: number;
}

export interface PersistedCodeExecution {
  id: string;
  classroomId: string;
  sessionId: string;
  language: CodeLanguage;
  entrypoint: string;
  status: CodeExecutionStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  previewMode: CodePreviewMode;
  previewUrl: string | null;
  previewToken: string | null;
  artifacts: PersistedCodeArtifact[];
  startedAt: string;
  finishedAt: string | null;
  error?: string;
}

export interface CodeExecutionResult {
  execution: PersistedCodeExecution;
}
