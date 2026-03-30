import type { Scene, Stage } from '@/lib/types/stage';

export const COURSE_EXPORT_JOB_STATUS = ['pending', 'running', 'succeeded', 'failed'] as const;
export const COURSE_IMPORT_JOB_STATUS = [
  'pending',
  'running',
  'validated',
  'succeeded',
  'failed',
] as const;
export const CLASSROOM_REVISION_SOURCES = [
  'manual-save',
  'pre-regenerate',
  'pre-import-apply',
  'system',
] as const;
export const CLASSROOM_REGENERATION_TARGET_TYPES = [
  'classroom',
  'scene',
  'selection',
] as const;
export const CLASSROOM_REGENERATION_MODES = ['text', 'layout', 'media', 'full'] as const;
export const CLASSROOM_REGENERATION_JOB_STATUS = [
  'pending',
  'running',
  'preview-ready',
  'applied',
  'discarded',
  'failed',
] as const;

export type CourseExportJobStatus = (typeof COURSE_EXPORT_JOB_STATUS)[number];
export type CourseImportJobStatus = (typeof COURSE_IMPORT_JOB_STATUS)[number];
export type ClassroomRevisionSource = (typeof CLASSROOM_REVISION_SOURCES)[number];
export type ClassroomRegenerationTargetType =
  (typeof CLASSROOM_REGENERATION_TARGET_TYPES)[number];
export type ClassroomRegenerationMode = (typeof CLASSROOM_REGENERATION_MODES)[number];
export type ClassroomRegenerationJobStatus =
  (typeof CLASSROOM_REGENERATION_JOB_STATUS)[number];

export interface CoursePackageManifest {
  format: 'openmaic-course';
  version: number;
  exportedAt: string;
  sourceAppVersion?: string;
  courseId: string;
  courseName: string;
  sceneCount: number;
  assetCount: number;
  includesAssets: boolean;
  hashAlgorithm?: 'sha256';
}

export interface CourseExportJobResult {
  fileName: string;
  downloadUrl: string;
  manifest: CoursePackageManifest;
}

export interface CourseExportJobSummary {
  id: string;
  classroomId: string;
  status: CourseExportJobStatus;
  step: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
  result?: CourseExportJobResult;
  error?: string;
}

export interface CourseImportValidationSummary {
  manifest: CoursePackageManifest;
  warnings?: string[];
}

export interface CourseImportJobResult {
  classroomId: string;
  url: string;
}

export interface CourseImportJobSummary {
  id: string;
  status: CourseImportJobStatus;
  step: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
  uploadedFileName: string;
  validation?: CourseImportValidationSummary;
  result?: CourseImportJobResult;
  error?: string;
}

export interface ClassroomRevisionSummary {
  id: string;
  classroomId: string;
  source: ClassroomRevisionSource;
  summary?: string;
  createdAt: string;
  createdBy?: string;
}

export interface ClassroomRevisionRecord extends ClassroomRevisionSummary {
  stage: Stage;
  scenes: Scene[];
}

export interface ClassroomPatchSaveResult {
  classroomId: string;
  savedAt: string;
  saveMode: 'draft' | 'publish';
}

export interface ClassroomRegenerationPreview {
  stage?: Partial<Stage>;
  scenes?: Scene[];
  changedSceneIds?: string[];
}

export interface ClassroomRegenerationJobResult {
  applied: boolean;
  classroomId: string;
}

export interface ClassroomRegenerationJobSummary {
  id: string;
  classroomId: string;
  status: ClassroomRegenerationJobStatus;
  step: string;
  message?: string;
  targetType: ClassroomRegenerationTargetType;
  targetId?: string;
  regenerateMode: ClassroomRegenerationMode;
  preserveManualEdits: boolean;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  preview?: ClassroomRegenerationPreview;
  result?: ClassroomRegenerationJobResult;
  error?: string;
}

export interface CreateCourseExportJobResponseData {
  jobId: string;
  status: CourseExportJobStatus;
  step: string;
  message?: string;
}

export interface GetCourseExportJobResponseData {
  job: CourseExportJobSummary;
}

export interface CreateCourseImportJobResponseData {
  jobId: string;
  status: CourseImportJobStatus;
  step: string;
  message?: string;
}

export interface GetCourseImportJobResponseData {
  job: CourseImportJobSummary;
}

export interface ApplyCourseImportResponseData {
  classroomId: string;
  url: string;
}

export type PatchClassroomResponseData = ClassroomPatchSaveResult;

export interface CreateClassroomRevisionResponseData {
  revision: ClassroomRevisionSummary;
}

export interface ListClassroomRevisionsResponseData {
  revisions: ClassroomRevisionSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RestoreClassroomRevisionResponseData {
  classroomId: string;
  revisionId: string;
  restoredAt: string;
}

export interface CreateClassroomRegenerationJobResponseData {
  jobId: string;
  status: ClassroomRegenerationJobStatus;
  step: string;
  message?: string;
}

export interface GetClassroomRegenerationJobResponseData {
  job: ClassroomRegenerationJobSummary;
}

export interface ApplyClassroomRegenerationResponseData {
  classroomId: string;
  jobId: string;
  applied: true;
}

export interface DiscardClassroomRegenerationResponseData {
  jobId: string;
  discarded: true;
}
