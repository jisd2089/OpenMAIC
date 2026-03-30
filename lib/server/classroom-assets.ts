import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  classroomAudioDir,
  classroomMediaDir,
  classroomDir,
} from '@/lib/server/classroom-storage';

export interface ClassroomAssetEntry {
  relativePath: string;
  absolutePath: string;
  size: number;
}

async function collectFiles(baseDir: string, prefix: string): Promise<ClassroomAssetEntry[]> {
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(baseDir, entry.name);
        const relativePath = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) {
          return collectFiles(absolutePath, relativePath);
        }
        if (!entry.isFile()) {
          return [] as ClassroomAssetEntry[];
        }
        const stat = await fs.stat(absolutePath);
        return [{ relativePath, absolutePath, size: stat.size }];
      }),
    );
    return files.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function listClassroomAssetEntries(classroomId: string): Promise<ClassroomAssetEntry[]> {
  const [mediaEntries, audioEntries] = await Promise.all([
    collectFiles(classroomMediaDir(classroomId), 'media'),
    collectFiles(classroomAudioDir(classroomId), 'audio'),
  ]);
  return [...mediaEntries, ...audioEntries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function addClassroomAssetsToZip(zip: JSZip, classroomId: string): Promise<number> {
  const assetEntries = await listClassroomAssetEntries(classroomId);
  if (assetEntries.length === 0) {
    zip.folder('assets');
    return 0;
  }

  await Promise.all(
    assetEntries.map(async (entry) => {
      const buffer = await fs.readFile(entry.absolutePath);
      zip.file(path.posix.join('assets', entry.relativePath), buffer);
    }),
  );

  return assetEntries.length;
}

export async function extractCoursePackageAssets(zip: JSZip, classroomId: string): Promise<number> {
  const prefix = 'assets/';
  const assetFiles = Object.values(zip.files).filter((file) => !file.dir && file.name.startsWith(prefix));
  if (assetFiles.length === 0) {
    return 0;
  }

  await Promise.all(
    assetFiles.map(async (file) => {
      const relativePath = file.name.slice(prefix.length);
      const destination = path.join(classroomDir(classroomId), relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const buffer = await file.async('nodebuffer');
      await fs.writeFile(destination, buffer);
    }),
  );

  return assetFiles.length;
}

function rewriteClassroomMediaString(value: string, oldClassroomId: string, newClassroomId: string) {
  const oldSegment = `/api/classroom-media/${oldClassroomId}/`;
  const newSegment = `/api/classroom-media/${newClassroomId}/`;
  return value.includes(oldSegment) ? value.replaceAll(oldSegment, newSegment) : value;
}

export function rewriteClassroomAssetReferences<T>(
  value: T,
  oldClassroomId: string,
  newClassroomId: string,
): T {
  if (typeof value === 'string') {
    return rewriteClassroomMediaString(value, oldClassroomId, newClassroomId) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteClassroomAssetReferences(item, oldClassroomId, newClassroomId)) as T;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      rewriteClassroomAssetReferences(item, oldClassroomId, newClassroomId),
    ]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}
