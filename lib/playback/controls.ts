import type { PlaybackEngine } from './engine';

interface StartLectureOptions {
  readonly restart?: boolean;
}

type PlaybackController = Pick<PlaybackEngine, 'start' | 'continuePlayback' | 'isExhausted'>;

interface StartPlaybackFromIdleArgs {
  readonly engine: PlaybackController;
  readonly sceneId?: string | null;
  readonly wasCompleted: boolean;
  readonly startLecture?: (
    sceneId: string,
    options?: StartLectureOptions,
  ) => Promise<string | null | undefined>;
  readonly setLectureSessionId: (sessionId: string | null) => void;
  readonly resetPlaybackCompleted: () => void;
  readonly resetLectureActionCounter: () => void;
}

export function shouldConsumeDeferredPlayRequest(
  requestedSceneId: string | null,
  currentSceneId?: string,
): boolean {
  return requestedSceneId !== null && currentSceneId !== undefined && requestedSceneId === currentSceneId;
}

export async function startPlaybackFromIdle({
  engine,
  sceneId,
  wasCompleted,
  startLecture,
  setLectureSessionId,
  resetPlaybackCompleted,
  resetLectureActionCounter,
}: StartPlaybackFromIdleArgs): Promise<void> {
  const shouldRestart = wasCompleted || engine.isExhausted();
  resetPlaybackCompleted();

  if (sceneId && startLecture) {
    const sessionId = await startLecture(sceneId, { restart: shouldRestart });
    setLectureSessionId(sessionId ?? null);
  }

  if (shouldRestart) {
    resetLectureActionCounter();
    engine.start();
    return;
  }

  engine.continuePlayback();
}
