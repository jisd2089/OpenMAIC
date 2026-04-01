import JSZip from 'jszip';
import type { Scene, Stage } from '@/lib/types/stage';
import { buildGenerationContextExport } from '@/lib/export/context-export';
import type { ClassroomRevisionRecord, CoursePackageManifest } from '@/lib/server/classroom/types';
import { coursePackageFormatVersion } from '@/lib/server/classroom/contracts';
import { addClassroomAssetsToZip } from '@/lib/server/classroom-assets';

const COURSE_PACKAGE_FILE_SUFFIX = '.omaic-course.zip';
export function buildCoursePackageFileName(classroomId: string): string {
  return `${classroomId}${COURSE_PACKAGE_FILE_SUFFIX}`;
}

function buildCoursePackageManifest(params: {
  classroomId: string;
  stage: Stage;
  scenes: Scene[];
  assetCount: number;
  includesAssets: boolean;
}): CoursePackageManifest {
  return {
    format: 'openmaic-course',
    version: coursePackageFormatVersion,
    exportedAt: new Date().toISOString(),
    courseId: params.classroomId,
    courseName: params.stage.name,
    sceneCount: params.scenes.length,
    assetCount: params.assetCount,
    includesAssets: params.includesAssets,
  };
}

export async function buildCoursePackageBuffer(params: {
  classroomId: string;
  stage: Stage;
  scenes: Scene[];
  includeContext: boolean;
  includeAssets: boolean;
  revisions?: ClassroomRevisionRecord[];
}) {
  const zip = new JSZip();

  zip.file('stage.json', JSON.stringify(params.stage, null, 2));
  zip.file('scenes.json', JSON.stringify(params.scenes, null, 2));

  if (params.includeContext) {
    zip.file(
      'context.json',
      JSON.stringify(buildGenerationContextExport(params.stage, params.scenes), null, 2),
    );
  }

  let assetCount = 0;
  if (params.includeAssets) {
    assetCount = await addClassroomAssetsToZip(zip, params.classroomId);
  }

  if (params.revisions?.length) {
    await Promise.all(
      params.revisions.map(async (revision) => {
        zip.file(`revisions/${revision.id}.json`, JSON.stringify(revision, null, 2));
      }),
    );
  }

  const manifest = buildCoursePackageManifest({
    classroomId: params.classroomId,
    stage: params.stage,
    scenes: params.scenes,
    assetCount,
    includesAssets: assetCount > 0,
  });
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const fileName = buildCoursePackageFileName(params.classroomId);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return { buffer, fileName, manifest };
}

export async function parseCoursePackageBuffer(buffer: Buffer): Promise<{
  manifest: CoursePackageManifest;
  stage: Stage;
  scenes: Scene[];
  context: unknown | null;
  revisions: ClassroomRevisionRecord[];
  zip: JSZip;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const manifestRaw = await zip.file('manifest.json')?.async('string');
  const stageRaw = await zip.file('stage.json')?.async('string');
  const scenesRaw = await zip.file('scenes.json')?.async('string');
  const contextRaw = await zip.file('context.json')?.async('string');

  if (!manifestRaw || !stageRaw || !scenesRaw) {
    throw new Error('Course package must include manifest.json, stage.json, and scenes.json');
  }

  const manifest = JSON.parse(manifestRaw) as CoursePackageManifest;
  const stage = JSON.parse(stageRaw) as Stage;
  const scenes = JSON.parse(scenesRaw) as Scene[];
  const context = contextRaw ? JSON.parse(contextRaw) : null;
  const revisions = await Promise.all(
    Object.values(zip.files)
      .filter((file) => !file.dir && file.name.startsWith('revisions/') && file.name.endsWith('.json'))
      .map(async (file) => JSON.parse(await file.async('string')) as ClassroomRevisionRecord),
  );

  if (manifest.format !== 'openmaic-course') {
    throw new Error('Unsupported course package format');
  }
  if (manifest.version !== coursePackageFormatVersion) {
    throw new Error(`Unsupported course package version: ${manifest.version}`);
  }
  if (!stage?.id || !stage?.name) {
    throw new Error('Invalid stage.json');
  }
  if (!Array.isArray(scenes)) {
    throw new Error('Invalid scenes.json');
  }

  return { manifest, stage, scenes, context, revisions, zip };
}
