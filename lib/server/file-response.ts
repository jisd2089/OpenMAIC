import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
};

function createNodeStream(filePath: string, start?: number, end?: number): ReadableStream {
  const stream = createReadStream(filePath, start != null ? { start, end } : undefined);
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });
}

export async function buildFileResponse(
  request: NextRequest | null,
  filePath: string,
): Promise<Response> {
  const stat = await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const range = request?.headers.get('range');

  if (!range) {
    return new NextResponse(createNodeStream(filePath), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${stat.size}` },
    });
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= stat.size) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${stat.size}` },
    });
  }

  return new NextResponse(createNodeStream(filePath, start, end), {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
