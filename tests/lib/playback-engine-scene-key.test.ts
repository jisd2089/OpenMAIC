import { describe, expect, it } from 'vitest';
import { getPlaybackEngineSceneKey } from '@/lib/playback/engine-scene-key';

describe('getPlaybackEngineSceneKey', () => {
  it('ignores scene timestamp churn for the active present-mode scene', () => {
    expect(
      getPlaybackEngineSceneKey({
        workspaceMode: 'present',
        sceneId: 'scene-1',
        sceneUpdatedAt: 100,
      }),
    ).toBe(
      getPlaybackEngineSceneKey({
        workspaceMode: 'present',
        sceneId: 'scene-1',
        sceneUpdatedAt: 200,
      }),
    );
  });

  it('changes when the workspace mode changes', () => {
    expect(
      getPlaybackEngineSceneKey({
        workspaceMode: 'present',
        sceneId: 'scene-1',
        sceneUpdatedAt: 100,
      }),
    ).not.toBe(
      getPlaybackEngineSceneKey({
        workspaceMode: 'edit',
        sceneId: 'scene-1',
        sceneUpdatedAt: 100,
      }),
    );
  });

  it('changes when the active scene changes', () => {
    expect(
      getPlaybackEngineSceneKey({
        workspaceMode: 'present',
        sceneId: 'scene-1',
        sceneUpdatedAt: 100,
      }),
    ).not.toBe(
      getPlaybackEngineSceneKey({
        workspaceMode: 'present',
        sceneId: 'scene-2',
        sceneUpdatedAt: 100,
      }),
    );
  });
});
