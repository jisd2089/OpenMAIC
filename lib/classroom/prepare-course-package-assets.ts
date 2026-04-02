'use client';

import { db, mediaFileKey, type AudioFileRecord, type MediaFileRecord } from '@/lib/utils/database';
import type { Scene } from '@/lib/types/stage';
import { isMediaPlaceholder } from '@/lib/store/media-generation';
import { parseKnowledgeMediaFileId } from '@/lib/kb/reference';

type FetchLike = typeof fetch;

interface DatabaseLike {
  mediaFiles: {
    get(key: string): Promise<MediaFileRecord | undefined>;
  };
  audioFiles: {
    get(key: string): Promise<AudioFileRecord | undefined>;
  };
}

interface PrepareCoursePackageAssetsParams {
  classroomId: string;
  scenes: Scene[];
  fetchImpl?: FetchLike;
  database?: DatabaseLike;
}

function getDefaultFetch(): FetchLike {
  return globalThis.fetch.bind(globalThis) as FetchLike;
}

function cloneScenes(scenes: Scene[]): Scene[] {
  return JSON.parse(JSON.stringify(scenes)) as Scene[];
}

function buildClassroomMediaUrl(classroomId: string, relativePath: string): string {
  return `/api/classroom-media/${classroomId}/${relativePath}`;
}

function isCurrentClassroomMediaUrl(classroomId: string, value: string): boolean {
  return value.includes(`/api/classroom-media/${classroomId}/`);
}

function parseKnowledgeFileRoute(value: string): { fileId: string; kind: 'content' | 'poster' } | null {
  const match = value.match(/\/api\/kb\/files\/([^/]+)\/(content|poster)(?:[?#].*)?$/);
  if (!match) return null;
  return {
    fileId: decodeURIComponent(match[1]),
    kind: match[2] as 'content' | 'poster',
  };
}

function inferExtension(params: {
  mimeType?: string | null;
  fallback?: string;
  source?: string;
}): string {
  const normalizedMime = params.mimeType?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
  };
  if (normalizedMime && mimeMap[normalizedMime]) {
    return mimeMap[normalizedMime];
  }

  if (params.source) {
    const cleanSource = params.source.split('#')[0]?.split('?')[0] ?? '';
    const sourceExt = cleanSource.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (sourceExt) {
      return sourceExt;
    }
  }

  return params.fallback ?? 'bin';
}

async function readJsonSafe(response: Response): Promise<{ error?: string; details?: string }> {
  try {
    return (await response.json()) as { error?: string; details?: string };
  } catch {
    return {};
  }
}

async function uploadClassroomAsset(params: {
  classroomId: string;
  relativePath: string;
  blob: Blob;
  fetchImpl: FetchLike;
}): Promise<string> {
  const formData = new FormData();
  const fileName = params.relativePath.split('/').pop() || 'asset.bin';
  formData.set(
    'file',
    new File([params.blob], fileName, {
      type: params.blob.type || 'application/octet-stream',
    }),
  );
  formData.set('relativePath', params.relativePath);

  const response = await params.fetchImpl(`/api/classroom/${params.classroomId}/assets`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const json = await readJsonSafe(response);
    throw new Error(json.details || json.error || 'Failed to upload classroom asset');
  }

  return buildClassroomMediaUrl(params.classroomId, params.relativePath);
}

async function fetchBlob(params: {
  source: string;
  fetchImpl: FetchLike;
}): Promise<{ blob: Blob; mimeType: string }> {
  const response = await params.fetchImpl(params.source);
  if (!response.ok) {
    const json = await readJsonSafe(response);
    throw new Error(json.details || json.error || `Failed to fetch asset: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  return {
    blob,
    mimeType: blob.type || response.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function prepareCoursePackageAssets(
  params: PrepareCoursePackageAssetsParams,
): Promise<Scene[]> {
  const fetchImpl = params.fetchImpl ?? getDefaultFetch();
  const database = params.database ?? db;
  const scenes = cloneScenes(params.scenes);
  const uploadedUrlByKey = new Map<string, string>();

  const ensureUploaded = async (relativePath: string, blob: Blob): Promise<string> => {
    const cacheKey = `${relativePath}:${blob.size}:${blob.type || 'application/octet-stream'}`;
    const cached = uploadedUrlByKey.get(cacheKey);
    if (cached) return cached;
    const url = await uploadClassroomAsset({
      classroomId: params.classroomId,
      relativePath,
      blob,
      fetchImpl,
    });
    uploadedUrlByKey.set(cacheKey, url);
    return url;
  };

  const resolveRemoteMedia = async (input: {
    source: string;
    defaultBaseName: string;
    defaultDir: 'media' | 'audio';
    fallbackExtension: string;
  }): Promise<string> => {
    if (isCurrentClassroomMediaUrl(params.classroomId, input.source)) {
      return input.source;
    }

    const knowledgeRef = parseKnowledgeMediaFileId(input.source);
    const kbRoute = parseKnowledgeFileRoute(input.source);
    const source =
      knowledgeRef
        ? `/api/kb/files/${knowledgeRef}/content`
        : kbRoute
          ? `/api/kb/files/${kbRoute.fileId}/${kbRoute.kind}`
          : input.source;
    const sourceKey =
      knowledgeRef != null
        ? `knowledge:${knowledgeRef}:${input.defaultDir}`
        : kbRoute
          ? `kb-route:${kbRoute.fileId}:${kbRoute.kind}`
          : `remote:${source}`;

    const cached = uploadedUrlByKey.get(sourceKey);
    if (cached) return cached;

    const { blob, mimeType } = await fetchBlob({ source, fetchImpl });
    const extension = inferExtension({
      mimeType,
      fallback: input.fallbackExtension,
      source,
    });
    const relativePath = `${input.defaultDir}/${input.defaultBaseName}.${extension}`;
    const url = await ensureUploaded(relativePath, blob);
    uploadedUrlByKey.set(sourceKey, url);
    return url;
  };

  const resolvePoster = async (input: {
    poster: string | undefined;
    src: string;
    baseName: string;
  }): Promise<string | undefined> => {
    if (!input.poster && !parseKnowledgeMediaFileId(input.src)) {
      return undefined;
    }
    const posterSource =
      input.poster ||
      (() => {
        const fileId = parseKnowledgeMediaFileId(input.src);
        return fileId ? `/api/kb/files/${fileId}/poster` : undefined;
      })();
    if (!posterSource) return undefined;
    if (isCurrentClassroomMediaUrl(params.classroomId, posterSource)) {
      return posterSource;
    }

    const { blob, mimeType } = await fetchBlob({ source: posterSource, fetchImpl });
    const extension = inferExtension({
      mimeType,
      fallback: 'jpg',
      source: posterSource,
    });
    return ensureUploaded(`media/${input.baseName}.poster.${extension}`, blob);
  };

  for (const scene of scenes) {
    const actions = scene.actions || [];
    for (const action of actions) {
      if (action.type !== 'speech' || !action.audioId) continue;

      if (action.audioUrl && isCurrentClassroomMediaUrl(params.classroomId, action.audioUrl)) {
        continue;
      }

      if (action.audioUrl) {
        action.audioUrl = await resolveRemoteMedia({
          source: action.audioUrl,
          defaultBaseName: action.audioId,
          defaultDir: 'audio',
          fallbackExtension: 'mp3',
        });
        continue;
      }

      const audioRecord = await database.audioFiles.get(action.audioId);
      if (!audioRecord) continue;
      const extension = inferExtension({
        mimeType: audioRecord.blob.type,
        fallback: audioRecord.format || 'mp3',
      });
      action.audioUrl = await ensureUploaded(`audio/${action.audioId}.${extension}`, audioRecord.blob);
    }

    if (scene.type !== 'slide') continue;

    const elements = (
      scene.content as {
        canvas?: { elements?: Array<Record<string, unknown>> };
      }
    )?.canvas?.elements;

    if (!elements) continue;

    for (const element of elements) {
      const source = typeof element.src === 'string' ? element.src : null;
      const elementType = typeof element.type === 'string' ? element.type : null;
      const elementId = typeof element.id === 'string' ? element.id : `asset_${scene.id}`;
      if (!source || (elementType !== 'image' && elementType !== 'video' && elementType !== 'audio')) {
        continue;
      }

      if (isCurrentClassroomMediaUrl(params.classroomId, source)) {
        continue;
      }

      if (isMediaPlaceholder(source)) {
        const record = await database.mediaFiles.get(mediaFileKey(params.classroomId, source));
        if (!record || record.error || record.blob.size === 0) continue;
        const extension = inferExtension({
          mimeType: record.mimeType || record.blob.type,
          fallback: elementType === 'video' ? 'mp4' : 'png',
        });
        element.src = await ensureUploaded(`media/${source}.${extension}`, record.blob);

        if (elementType === 'video' && record.poster) {
          const posterExtension = inferExtension({
            mimeType: record.poster.type,
            fallback: 'jpg',
          });
          element.poster = await ensureUploaded(
            `media/${source}.poster.${posterExtension}`,
            record.poster,
          );
        }
        continue;
      }

      element.src = await resolveRemoteMedia({
        source,
        defaultBaseName: elementId,
        defaultDir: elementType === 'audio' ? 'audio' : 'media',
        fallbackExtension:
          elementType === 'video' ? 'mp4' : elementType === 'audio' ? 'mp3' : 'png',
      });

      if (elementType === 'video') {
        const currentPoster = typeof element.poster === 'string' ? element.poster : undefined;
        const posterUrl = await resolvePoster({
          poster: currentPoster,
          src: source,
          baseName: elementId,
        });
        if (posterUrl) {
          element.poster = posterUrl;
        }
      }
    }
  }

  return scenes;
}
