import path from 'path';
import { promises as fs } from 'fs';
import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { classroomDir } from '@/lib/server/classroom-storage';

function isValidAssetPath(relativePath: string): boolean {
  return (
    (relativePath.startsWith('media/') || relativePath.startsWith('audio/')) &&
    !relativePath.includes('..') &&
    !relativePath.includes('\0')
  );
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
  if (!params.success) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
  }

  const formData = await req.formData();
  const relativePath = String(formData.get('relativePath') || '').trim();
  const file = formData.get('file');

  if (!relativePath || !isValidAssetPath(relativePath)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid asset path');
  }
  if (!(file instanceof File)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Asset file is required');
  }

  const destination = path.join(classroomDir(params.data.id), relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, Buffer.from(await file.arrayBuffer()));

  return apiSuccess({
    relativePath,
    url: `/api/classroom-media/${params.data.id}/${relativePath}`,
  });
}
