import type { CodeLanguage } from '@/lib/code/runtime-catalog';
import { createDefaultCodeFiles } from '@/lib/code/runtime-catalog';

export interface CodeDraftFile {
  path: string;
  content: string;
}

export interface CodeDraftState {
  language: CodeLanguage;
  entrypoint: string;
  files: CodeDraftFile[];
  stdin: string;
  activeFilePath: string;
  updatedAt: number;
}

function storageKey(
  classroomId: string,
  sceneId: string,
  clientSessionId: string,
  view: 'teacher' | 'student',
) {
  return `openmaic:code-draft:${classroomId}:${sceneId}:${clientSessionId}:${view}`;
}

export function createDefaultDraft(language: CodeLanguage): CodeDraftState {
  const files = createDefaultCodeFiles(language);
  return {
    language,
    entrypoint: files[0].path,
    files,
    stdin: '',
    activeFilePath: files[0].path,
    updatedAt: Date.now(),
  };
}

export function readCodeDraftFromStorage(
  classroomId: string,
  sceneId: string,
  clientSessionId: string,
  view: 'teacher' | 'student',
): CodeDraftState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(classroomId, sceneId, clientSessionId, view));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CodeDraftState;
  } catch {
    return null;
  }
}

export function writeCodeDraftToStorage(
  classroomId: string,
  sceneId: string,
  clientSessionId: string,
  view: 'teacher' | 'student',
  draft: CodeDraftState,
) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    storageKey(classroomId, sceneId, clientSessionId, view),
    JSON.stringify(draft),
  );
}
