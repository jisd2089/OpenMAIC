/**
 * Audio Player - Audio player interface
 *
 * Handles audio playback, pause, stop, and other operations
 * Loads pre-generated TTS audio files from IndexedDB
 *
 */

import { db } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('AudioPlayer');

/**
 * Audio player implementation
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private onEndedCallback: (() => void) | null = null;
  private muted: boolean = false;
  private volume: number = 1;
  private playbackRate: number = 1;

  private isAudioFinished(audio: HTMLAudioElement): boolean {
    if (audio.ended) {
      return true;
    }
    return Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration;
  }

  private getLiveAudio(): HTMLAudioElement | null {
    if (!this.audio) {
      return null;
    }
    if (this.isAudioFinished(this.audio)) {
      this.audio = null;
      return null;
    }
    return this.audio;
  }

  private bindEndedHandler(audio: HTMLAudioElement, onEnded?: () => void): void {
    audio.addEventListener('ended', () => {
      if (this.audio === audio) {
        this.audio = null;
      }
      onEnded?.();
      this.onEndedCallback?.();
    });
  }

  /**
   * Play audio (from URL or IndexedDB pre-generated cache)
   * @param audioId Audio ID
   * @param audioUrl Optional server-generated audio URL (takes priority over IndexedDB)
   * @returns true if audio started playing, false if no audio (TTS disabled or not generated)
   */
  public async play(audioId: string, audioUrl?: string): Promise<boolean> {
    try {
      // 1. Try audioUrl first (server-generated TTS)
      if (audioUrl) {
        this.stop();
        const audio = new Audio();
        this.audio = audio;
        audio.src = audioUrl;
        if (this.muted) audio.volume = 0;
        else audio.volume = this.volume;
        audio.defaultPlaybackRate = this.playbackRate;
        audio.playbackRate = this.playbackRate;
        this.bindEndedHandler(audio);
        await audio.play();
        audio.playbackRate = this.playbackRate;
        return true;
      }

      // 2. Fall back to IndexedDB (client-generated TTS)
      const audioRecord = await db.audioFiles.get(audioId);

      if (!audioRecord) {
        // Pre-generated audio does not exist (generation failed), skip silently
        return false;
      }

      // Stop current playback
      this.stop();

      // Create audio element
      const audio = new Audio();
      this.audio = audio;

      // Set audio source
      const blobUrl = URL.createObjectURL(audioRecord.blob);
      audio.src = blobUrl;
      if (this.muted) audio.volume = 0;
      else audio.volume = this.volume;

      // Apply playback rate
      audio.defaultPlaybackRate = this.playbackRate;
      audio.playbackRate = this.playbackRate;

      // Set ended callback
      this.bindEndedHandler(audio, () => {
        URL.revokeObjectURL(blobUrl);
      });

      // Play
      await audio.play();
      // Re-apply after play() — some browsers reset during load
      audio.playbackRate = this.playbackRate;
      return true;
    } catch (error) {
      log.error('Failed to play audio:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    const audio = this.getLiveAudio();
    if (audio && !audio.paused) {
      audio.pause();
    }
  }

  /**
   * Stop playback
   */
  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    // Note: onEndedCallback intentionally NOT cleared here because play()
    // calls stop() internally — clearing would break the callback chain.
    // Stale callbacks are harmless: engine mode check prevents processNext().
  }

  /**
   * Resume playback
   */
  public resume(): boolean {
    const audio = this.getLiveAudio();
    if (!audio) {
      return false;
    }
    if (!audio.paused) {
      return true;
    }

    audio.playbackRate = this.playbackRate;
    audio.play().catch((error) => {
      if (this.audio === audio) {
        this.audio = null;
      }
      this.onEndedCallback?.();
      log.error('Failed to resume audio:', error);
    });
    return true;
  }

  /**
   * Get current playback status (actively playing, not paused)
   */
  public isPlaying(): boolean {
    const audio = this.getLiveAudio();
    return audio !== null && !audio.paused;
  }

  /**
   * Whether there is active audio (playing or paused, but not ended)
   * Used to decide whether to resume playback or skip to the next line
   */
  public hasActiveAudio(): boolean {
    return this.getLiveAudio() !== null;
  }

  /**
   * Get current playback time (milliseconds)
   */
  public getCurrentTime(): number {
    const audio = this.getLiveAudio();
    return audio ? audio.currentTime * 1000 : 0;
  }

  /**
   * Get audio duration (milliseconds)
   */
  public getDuration(): number {
    const audio = this.getLiveAudio();
    return audio && !isNaN(audio.duration) ? audio.duration * 1000 : 0;
  }

  /**
   * Set playback ended callback
   */
  public onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * Set mute state (takes effect immediately on currently playing audio)
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    const audio = this.getLiveAudio();
    if (audio) {
      audio.volume = muted ? 0 : this.volume;
    }
  }

  /**
   * Set volume (0-1)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    const audio = this.getLiveAudio();
    if (audio && !this.muted) {
      audio.volume = this.volume;
    }
  }

  /**
   * Set playback speed (takes effect immediately on currently playing audio)
   */
  public setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2, rate));
    const audio = this.getLiveAudio();
    if (audio) {
      audio.playbackRate = this.playbackRate;
    }
  }

  /**
   * Destroy the player
   */
  public destroy(): void {
    this.stop();
    this.onEndedCallback = null;
  }
}

/**
 * Create an audio player instance
 */
export function createAudioPlayer(): AudioPlayer {
  return new AudioPlayer();
}
