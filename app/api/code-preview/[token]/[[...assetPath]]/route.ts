import { promises as fs } from 'fs';
import path from 'path';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { codeSessionOutputsDir } from '@/lib/server/code/storage';

function decodePreviewToken(token: string) {
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      classroomId: string;
      sessionId: string;
      executionId: string;
    };
  } catch {
    return null;
  }
}

function mimeTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string; assetPath?: string[] }> },
) {
  const params = await context.params;
  const decoded = decodePreviewToken(params.token);
  if (!decoded) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid preview token');
  }

  const relativePath = params.assetPath?.length ? params.assetPath.join('/') : 'index.html';
  if (relativePath.includes('..')) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid preview path');
  }

  const root = path.join(
    codeSessionOutputsDir(decoded.classroomId, decoded.sessionId),
    decoded.executionId,
  );
  const filePath = path.join(root, relativePath);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.normalize(root))) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid preview path');
  }

  try {
    const content = await fs.readFile(normalized);
    return new Response(content, {
      status: 200,
      headers: {
        'content-type': mimeTypeFor(normalized),
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Preview asset not found');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read preview asset');
  }
}
