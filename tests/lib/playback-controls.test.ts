import { describe, expect, it, vi } from 'vitest';
import { shouldConsumeDeferredPlayRequest, startPlaybackFromIdle } from '@/lib/playback/controls';

describe('shouldConsumeDeferredPlayRequest', () => {
  it('only consumes a deferred request for the same scene', () => {
    expect(shouldConsumeDeferredPlayRequest('scene-1', 'scene-1')).toBe(true);
    expect(shouldConsumeDeferredPlayRequest('scene-1', 'scene-2')).toBe(false);
    expect(shouldConsumeDeferredPlayRequest(null, 'scene-1')).toBe(false);
    expect(shouldConsumeDeferredPlayRequest('scene-1', undefined)).toBe(false);
  });
});

describe('startPlaybackFromIdle', () => {
  it('continues playback and keeps the lecture counter when resuming an idle scene', async () => {
    const engine = {
      start: vi.fn(),
      continuePlayback: vi.fn(),
      isExhausted: vi.fn(() => false),
    };
    const startLecture = vi.fn(async () => 'lecture-session-1');
    const setLectureSessionId = vi.fn();
    const resetPlaybackCompleted = vi.fn();
    const resetLectureActionCounter = vi.fn();

    await startPlaybackFromIdle({
      engine,
      sceneId: 'scene-1',
      wasCompleted: false,
      startLecture,
      setLectureSessionId,
      resetPlaybackCompleted,
      resetLectureActionCounter,
    });

    expect(resetPlaybackCompleted).toHaveBeenCalledTimes(1);
    expect(startLecture).toHaveBeenCalledWith('scene-1', { restart: false });
    expect(setLectureSessionId).toHaveBeenCalledWith('lecture-session-1');
    expect(engine.continuePlayback).toHaveBeenCalledTimes(1);
    expect(engine.start).not.toHaveBeenCalled();
    expect(resetLectureActionCounter).not.toHaveBeenCalled();
  });

  it('restarts from the beginning after a completed playback', async () => {
    const engine = {
      start: vi.fn(),
      continuePlayback: vi.fn(),
      isExhausted: vi.fn(() => true),
    };
    const startLecture = vi.fn(async () => 'lecture-session-2');
    const setLectureSessionId = vi.fn();
    const resetPlaybackCompleted = vi.fn();
    const resetLectureActionCounter = vi.fn();

    await startPlaybackFromIdle({
      engine,
      sceneId: 'scene-2',
      wasCompleted: true,
      startLecture,
      setLectureSessionId,
      resetPlaybackCompleted,
      resetLectureActionCounter,
    });

    expect(resetPlaybackCompleted).toHaveBeenCalledTimes(1);
    expect(startLecture).toHaveBeenCalledWith('scene-2', { restart: true });
    expect(setLectureSessionId).toHaveBeenCalledWith('lecture-session-2');
    expect(resetLectureActionCounter).toHaveBeenCalledTimes(1);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.continuePlayback).not.toHaveBeenCalled();
  });

  it('restarts from the beginning when the engine is exhausted even if UI state is stale', async () => {
    const engine = {
      start: vi.fn(),
      continuePlayback: vi.fn(),
      isExhausted: vi.fn(() => true),
    };
    const startLecture = vi.fn(async () => 'lecture-session-3');
    const setLectureSessionId = vi.fn();
    const resetPlaybackCompleted = vi.fn();
    const resetLectureActionCounter = vi.fn();

    await startPlaybackFromIdle({
      engine,
      sceneId: 'scene-3',
      wasCompleted: false,
      startLecture,
      setLectureSessionId,
      resetPlaybackCompleted,
      resetLectureActionCounter,
    });

    expect(startLecture).toHaveBeenCalledWith('scene-3', { restart: true });
    expect(resetLectureActionCounter).toHaveBeenCalledTimes(1);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.continuePlayback).not.toHaveBeenCalled();
  });
});
