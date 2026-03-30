import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

export interface VideoMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs = 15000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      resolve({
        code: null,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: null, stdout: '', stderr: '' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    });
  });
}

let ffprobeAvailable: boolean | null = null;
let ffmpegAvailable: boolean | null = null;

async function hasFfprobe(): Promise<boolean> {
  if (ffprobeAvailable != null) return ffprobeAvailable;
  const result = await runCommand('ffprobe', ['-version'], 5000);
  ffprobeAvailable = result.code === 0;
  return ffprobeAvailable;
}

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable != null) return ffmpegAvailable;
  const result = await runCommand('ffmpeg', ['-version'], 5000);
  ffmpegAvailable = result.code === 0;
  return ffmpegAvailable;
}

export async function extractVideoMetadata(filePath: string): Promise<VideoMetadata> {
  if (!(await hasFfprobe())) return {};

  const result = await runCommand(
    'ffprobe',
    [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ],
    15000,
  );
  if (result.code !== 0 || !result.stdout) return {};

  try {
    const parsed = JSON.parse(result.stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
    };
    const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');
    const durationSec =
      Number(videoStream?.duration || parsed.format?.duration || 0) || undefined;

    return {
      ...(durationSec ? { durationMs: Math.round(durationSec * 1000) } : {}),
      ...(videoStream?.width ? { width: Number(videoStream.width) } : {}),
      ...(videoStream?.height ? { height: Number(videoStream.height) } : {}),
    };
  } catch {
    return {};
  }
}

export async function generateVideoPoster(
  filePath: string,
  posterPath: string,
): Promise<boolean> {
  if (!(await hasFfmpeg())) return false;

  await fs.mkdir(path.dirname(posterPath), { recursive: true });

  const result = await runCommand(
    'ffmpeg',
    ['-y', '-ss', '00:00:00.500', '-i', filePath, '-frames:v', '1', posterPath],
    20000,
  );

  return result.code === 0;
}

export async function extractVideoAudio(
  filePath: string,
  audioPath: string,
): Promise<boolean> {
  if (!(await hasFfmpeg())) return false;

  await fs.mkdir(path.dirname(audioPath), { recursive: true });

  const result = await runCommand(
    'ffmpeg',
    ['-y', '-i', filePath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audioPath],
    30000,
  );

  return result.code === 0;
}
