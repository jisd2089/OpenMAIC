import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/database', () => ({
  db: {
    audioFiles: {
      get: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

class FakeAudio {
  src = '';
  volume = 1;
  defaultPlaybackRate = 1;
  playbackRate = 1;
  paused = true;
  ended = false;
  currentTime = 0;
  duration = 1;
  playCalls = 0;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(event: string, handler: () => void) {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    set.add(handler);
    this.listeners.set(event, set);
  }

  async play() {
    this.playCalls++;
    this.paused = false;
    this.ended = false;
  }

  pause() {
    this.paused = true;
  }

  fireEnded() {
    this.paused = true;
    this.ended = true;
    for (const handler of this.listeners.get('ended') ?? []) {
      handler();
    }
  }
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('resumes the paused audio element instead of replacing it', async () => {
    const created: FakeAudio[] = [];
    class MockAudio extends FakeAudio {
      constructor() {
        super();
        created.push(this);
      }
    }
    vi.stubGlobal('Audio', MockAudio);

    const { AudioPlayer } = await import('@/lib/utils/audio-player');
    const player = new AudioPlayer();

    await expect(player.play('ignored', 'https://example.com/audio.mp3')).resolves.toBe(true);
    expect(player.hasActiveAudio()).toBe(true);
    expect(player.isPlaying()).toBe(true);

    created[0].pause();
    expect(player.isPlaying()).toBe(false);

    player.resume();

    expect(created[0].playCalls).toBe(2);
    expect(player.hasActiveAudio()).toBe(true);
    expect(player.isPlaying()).toBe(true);
  });

  it('fires the ended callback when audio playback completes naturally', async () => {
    const created: FakeAudio[] = [];
    class MockAudio extends FakeAudio {
      constructor() {
        super();
        created.push(this);
      }
    }
    vi.stubGlobal('Audio', MockAudio);

    const { AudioPlayer } = await import('@/lib/utils/audio-player');
    const player = new AudioPlayer();
    const onEnded = vi.fn();
    player.onEnded(onEnded);

    await expect(player.play('ignored', 'https://example.com/audio.mp3')).resolves.toBe(true);

    created[0].fireEnded();

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
  });
});
