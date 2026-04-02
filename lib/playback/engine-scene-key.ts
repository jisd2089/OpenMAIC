import type { ClassroomWorkspaceMode } from '@/lib/types/stage';

/**
 * Playback engine instances should follow scene identity, not incidental
 * timestamp churn on the same scene.
 */
export function getPlaybackEngineSceneKey(params: {
  workspaceMode: ClassroomWorkspaceMode;
  sceneId?: string | null;
  sceneUpdatedAt?: number | null;
}): string {
  const sceneId = params.sceneId ?? 'none';
  void params.sceneUpdatedAt;
  return `${params.workspaceMode}:${sceneId}`;
}
