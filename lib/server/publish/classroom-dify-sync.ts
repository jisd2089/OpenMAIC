import { createLogger } from '@/lib/logger';
import { readClassroom } from '@/lib/server/classroom-storage';
import { DifyClient, DifyApiError, type DifyMetadataField } from '@/lib/server/publish/dify-client';
import { getDifyConfig, isDifySyncConfigured } from '@/lib/server/publish/dify-config';
import {
  readClassroomDifySyncRecord,
  updateClassroomDifySyncRecord,
  type ClassroomDifyMetadata,
  type ClassroomDifySyncRecord,
  type ClassroomPublishTriggerSource,
} from '@/lib/server/publish/classroom-publish-store';
import { serializeClassroomForDify } from '@/lib/server/publish/classroom-dify-serializer';

const log = createLogger('ClassroomDifySync');
const runningSyncs = new Map<string, Promise<ClassroomDifySyncRecord>>();
const pendingSyncs = new Map<
  string,
  { triggerSource: ClassroomPublishTriggerSource; force?: boolean }
>();

type SyncMutationMode = 'create' | 'update' | 'recreate';

function nowIso() {
  return new Date().toISOString();
}

function buildMetadata(classroomId: string, title?: string, type?: string): ClassroomDifyMetadata {
  return {
    classroom: classroomId,
    type: type || 'course',
    title: title || classroomId,
  };
}

function renderDocumentName(template: string, metadata: ClassroomDifyMetadata) {
  const resolved = template
    .replace(/\{classroom\}/g, metadata.classroom)
    .replace(/\{type\}/g, metadata.type)
    .replace(/\{title\}/g, metadata.title);
  return resolved.trim() || metadata.title || metadata.classroom;
}

function resolveDocumentLanguage(language?: string) {
  if (language === 'zh-CN') return 'Chinese';
  if (language === 'en-US') return 'English';
  return undefined;
}

function normalizeBoundDocumentId(value: string | null | undefined) {
  return value?.trim() ? value : null;
}

export function buildDefaultClassroomDifyRecord(input: {
  classroomId: string;
  metadata?: ClassroomDifyMetadata;
  triggerSource?: ClassroomPublishTriggerSource;
}): ClassroomDifySyncRecord {
  const config = getDifyConfig();
  const timestamp = nowIso();

  return {
    classroomId: input.classroomId,
    provider: 'dify',
    enabled: isDifySyncConfigured(config),
    status: 'idle',
    targetBaseUrl: config.baseUrl,
    datasetId: config.datasetId,
    documentId: null,
    documentName: null,
    documentCreatedAt: null,
    triggerSource: input.triggerSource || 'generate',
    metadata: input.metadata || buildMetadata(input.classroomId),
    batchId: null,
    contentHash: null,
    remoteIndexingStatus: null,
    lastAttemptAt: null,
    lastSyncedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function getClassroomDifySyncStatus(classroomId: string) {
  const stored = await readClassroomDifySyncRecord(classroomId);
  if (stored) return stored;

  const classroom = await readClassroom(classroomId);
  return buildDefaultClassroomDifyRecord({
    classroomId,
    metadata: buildMetadata(
      classroomId,
      classroom?.stage.name,
      classroom?.stage.generationContext?.classroomType,
    ),
  });
}

async function markQueued(input: {
  classroomId: string;
  triggerSource: ClassroomPublishTriggerSource;
  metadata: ClassroomDifyMetadata;
}) {
  const config = getDifyConfig();
  return updateClassroomDifySyncRecord(input.classroomId, (existing) => ({
    ...(existing || buildDefaultClassroomDifyRecord({ classroomId: input.classroomId })),
    enabled: isDifySyncConfigured(config),
    targetBaseUrl: config.baseUrl,
    datasetId: config.datasetId,
    metadata: input.metadata,
    triggerSource: input.triggerSource,
    status: 'queued',
    lastAttemptAt: nowIso(),
    updatedAt: nowIso(),
    errorCode: null,
    errorMessage: null,
  }));
}

async function ensureMetadataFields(
  client: DifyClient,
  metadata: ClassroomDifyMetadata,
): Promise<DifyMetadataField[]> {
  const requiredKeys = Object.keys(metadata);
  const existing = await client.listMetadataFields();
  const byName = new Map(existing.map((field) => [field.name, field]));
  const resolved: DifyMetadataField[] = [];

  for (const key of requiredKeys) {
    const current = byName.get(key);
    if (current) {
      resolved.push(current);
      continue;
    }

    try {
      const created = await client.createMetadataField(key);
      resolved.push(created);
      byName.set(key, created);
    } catch (error) {
      if (error instanceof DifyApiError && error.status === 400) {
        const refreshed = await client.listMetadataFields();
        const duplicate = refreshed.find((field) => field.name === key);
        if (duplicate) {
          resolved.push(duplicate);
          byName.set(key, duplicate);
          continue;
        }
      }
      throw error;
    }
  }

  return resolved;
}

async function runSync(input: {
  classroomId: string;
  triggerSource: ClassroomPublishTriggerSource;
  force?: boolean;
}): Promise<ClassroomDifySyncRecord> {
  const config = getDifyConfig();
  const classroom = await readClassroom(input.classroomId);
  if (!classroom) {
    throw new Error(`Classroom not found: ${input.classroomId}`);
  }

  const serialized = serializeClassroomForDify({
    classroomId: input.classroomId,
    stage: classroom.stage,
    scenes: classroom.scenes,
  });
  const documentLanguage = resolveDocumentLanguage(classroom.stage.language);
  const desiredDocumentName = renderDocumentName(config.documentNameTemplate, serialized.metadata);

  log.info('Prepared classroom payload for Dify sync', {
    classroomId: input.classroomId,
    triggerSource: input.triggerSource,
    force: Boolean(input.force),
    targetBaseUrl: config.baseUrl,
    datasetId: config.datasetId,
    metadata: serialized.metadata,
    desiredDocumentName,
    sceneCount: classroom.scenes.length,
    segmentCount: serialized.segments.length,
    textLength: serialized.documentText.length,
    contentHash: serialized.contentHash,
  });

  if (!isDifySyncConfigured(config)) {
    log.info('Skipped classroom Dify sync because config is incomplete or disabled', {
      classroomId: input.classroomId,
      triggerSource: input.triggerSource,
      enabled: config.enabled,
      hasBaseUrl: Boolean(config.baseUrl),
      hasDatasetId: Boolean(config.datasetId),
      hasApiKey: Boolean(config.apiKey),
    });
    return updateClassroomDifySyncRecord(input.classroomId, (existing) => ({
      ...(existing ||
        buildDefaultClassroomDifyRecord({
          classroomId: input.classroomId,
          metadata: serialized.metadata,
          triggerSource: input.triggerSource,
        })),
      enabled: false,
      metadata: serialized.metadata,
      triggerSource: input.triggerSource,
      status: 'idle',
      updatedAt: nowIso(),
    }));
  }

  const queued = await markQueued({
    classroomId: input.classroomId,
    triggerSource: input.triggerSource,
    metadata: serialized.metadata,
  });
  const boundDocumentId = normalizeBoundDocumentId(queued.documentId);

  if (!input.force && boundDocumentId && queued.contentHash && queued.contentHash === serialized.contentHash) {
    log.info('Skipped classroom Dify sync because content hash is unchanged', {
      classroomId: input.classroomId,
      triggerSource: input.triggerSource,
      contentHash: serialized.contentHash,
      documentId: boundDocumentId,
    });
    return updateClassroomDifySyncRecord(input.classroomId, (existing) => ({
      ...(existing || queued),
      metadata: serialized.metadata,
      triggerSource: input.triggerSource,
      status: 'skipped',
      contentHash: serialized.contentHash,
      updatedAt: nowIso(),
      errorCode: null,
      errorMessage: null,
    }));
  }

  const client = new DifyClient(config);
  let activeDocumentId = boundDocumentId;
  let activeDocumentName = queued.documentName || null;
  let activeDocumentCreatedAt = queued.documentCreatedAt || null;
  let batchId: string | null = null;
  let mutationMode: SyncMutationMode = activeDocumentId ? 'update' : 'create';

  try {
    if (!activeDocumentId) {
      log.info('Dify document create started for classroom', {
        classroomId: input.classroomId,
        triggerSource: input.triggerSource,
        datasetId: config.datasetId,
        desiredDocumentName,
      });
      const created = await client.createDocumentByText({
        name: desiredDocumentName,
        text: serialized.documentText,
        separator: serialized.separator,
        docLanguage: documentLanguage,
      });
      mutationMode = 'create';
      activeDocumentId = created.documentId;
      activeDocumentName = created.documentName;
      activeDocumentCreatedAt = created.createdAt;
      batchId = created.batch;
      log.info('Dify document create accepted for classroom', {
        classroomId: input.classroomId,
        triggerSource: input.triggerSource,
        datasetId: config.datasetId,
        documentId: activeDocumentId,
        documentName: activeDocumentName,
        batchId,
      });
    } else {
      try {
        const remoteDocument = await client.getDocument(activeDocumentId);
        log.info('Confirmed existing classroom-bound Dify document', {
          classroomId: input.classroomId,
          triggerSource: input.triggerSource,
          datasetId: config.datasetId,
          documentId: activeDocumentId,
          documentName:
            (typeof remoteDocument.name === 'string' && remoteDocument.name) || activeDocumentName,
          indexingStatus:
            (typeof remoteDocument.indexing_status === 'string' && remoteDocument.indexing_status) || null,
        });
      } catch (error) {
        if (error instanceof DifyApiError && error.status === 404) {
          mutationMode = 'recreate';
          log.warn('Classroom-bound Dify document is missing, recreating', {
            classroomId: input.classroomId,
            triggerSource: input.triggerSource,
            datasetId: config.datasetId,
            documentId: activeDocumentId,
          });
          const recreated = await client.createDocumentByText({
            name: desiredDocumentName,
            text: serialized.documentText,
            separator: serialized.separator,
            docLanguage: documentLanguage,
          });
          activeDocumentId = recreated.documentId;
          activeDocumentName = recreated.documentName;
          activeDocumentCreatedAt = recreated.createdAt;
          batchId = recreated.batch;
          log.info('Dify document recreated for classroom after remote document missing', {
            classroomId: input.classroomId,
            triggerSource: input.triggerSource,
            datasetId: config.datasetId,
            documentId: activeDocumentId,
            documentName: activeDocumentName,
            batchId,
          });
        } else {
          throw error;
        }
      }

      if (mutationMode === 'update') {
        log.info('Dify document update started for classroom', {
          classroomId: input.classroomId,
          triggerSource: input.triggerSource,
          datasetId: config.datasetId,
          documentId: activeDocumentId,
          desiredDocumentName,
        });
        const updated = await client.updateDocumentByText({
          documentId: activeDocumentId,
          name: desiredDocumentName,
          text: serialized.documentText,
          separator: serialized.separator,
          docLanguage: documentLanguage,
        });
        activeDocumentId = updated.documentId;
        activeDocumentName = updated.documentName;
        activeDocumentCreatedAt = updated.createdAt || activeDocumentCreatedAt;
        batchId = updated.batch;
        log.info('Dify document update accepted for classroom', {
          classroomId: input.classroomId,
          triggerSource: input.triggerSource,
          datasetId: config.datasetId,
          documentId: activeDocumentId,
          documentName: activeDocumentName,
          batchId,
        });
      }
    }

    await updateClassroomDifySyncRecord(input.classroomId, (existing) => ({
      ...(existing || queued),
      metadata: serialized.metadata,
      triggerSource: input.triggerSource,
      status: 'syncing',
      documentId: activeDocumentId,
      documentName: activeDocumentName,
      documentCreatedAt: activeDocumentCreatedAt,
      updatedAt: nowIso(),
    }));

    const metadataFields = await ensureMetadataFields(client, serialized.metadata);
    log.info('Resolved Dify metadata fields for classroom sync', {
      classroomId: input.classroomId,
      triggerSource: input.triggerSource,
      documentId: activeDocumentId,
      metadataKeys: metadataFields.map((field) => field.name),
    });
    await client.updateDocumentMetadata({
      documentId: activeDocumentId!,
      metadataList: metadataFields.map((field) => ({
        id: field.id,
        name: field.name,
        value: serialized.metadata[field.name as keyof ClassroomDifyMetadata],
      })),
    });

    await updateClassroomDifySyncRecord(input.classroomId, (existing) => ({
      ...(existing || queued),
      metadata: serialized.metadata,
      triggerSource: input.triggerSource,
      status: 'indexing',
      documentId: activeDocumentId,
      documentName: activeDocumentName,
      documentCreatedAt: activeDocumentCreatedAt,
      batchId,
      remoteIndexingStatus: 'waiting',
      updatedAt: nowIso(),
    }));

    let lastRemoteStatus: string | null = null;
    for (let attempt = 0; attempt < config.maxPollingAttempts; attempt += 1) {
      const entries = await client.getDocumentIndexingStatus(batchId!);
      const current = entries.find((entry) => entry.id === activeDocumentId) || entries[0];
      const remoteStatus = current?.indexing_status || 'waiting';
      if (attempt === 0 || remoteStatus !== lastRemoteStatus || remoteStatus === 'completed') {
        log.info('Polled Dify indexing status for classroom sync', {
          classroomId: input.classroomId,
          triggerSource: input.triggerSource,
          mutationMode,
          documentId: activeDocumentId,
          batchId,
          attempt: attempt + 1,
          maxAttempts: config.maxPollingAttempts,
          remoteStatus,
          completedSegments: current?.completed_segments ?? null,
          totalSegments: current?.total_segments ?? null,
          error: current?.error ?? null,
        });
        lastRemoteStatus = remoteStatus;
      }

      const record = await updateClassroomDifySyncRecord(input.classroomId, (existing) => ({
        ...(existing || queued),
        metadata: serialized.metadata,
        triggerSource: input.triggerSource,
        status: remoteStatus === 'completed' ? 'completed' : 'indexing',
        documentId: activeDocumentId,
        documentName: activeDocumentName,
        documentCreatedAt: activeDocumentCreatedAt,
        batchId,
        contentHash:
          remoteStatus === 'completed' ? serialized.contentHash : existing?.contentHash || null,
        remoteIndexingStatus: remoteStatus,
        lastSyncedAt: remoteStatus === 'completed' ? nowIso() : existing?.lastSyncedAt || null,
        errorCode: remoteStatus === 'error' ? 'INDEXING_ERROR' : null,
        errorMessage: current?.error || null,
        updatedAt: nowIso(),
      }));

      if (remoteStatus === 'completed') {
        log.info('Completed classroom Dify sync', {
          classroomId: input.classroomId,
          triggerSource: input.triggerSource,
          mutationMode,
          batchId,
          documentId: activeDocumentId,
          documentName: activeDocumentName,
          contentHash: serialized.contentHash,
          segmentCount: serialized.segments.length,
        });
        return record;
      }

      if (remoteStatus === 'error' || current?.error) {
        throw new Error(current?.error || 'Dify indexing failed');
      }

      await new Promise((resolve) => setTimeout(resolve, config.pollingIntervalMs));
    }

    throw new Error('Dify indexing polling timed out');
  } catch (error) {
    const errorCode =
      error instanceof DifyApiError ? error.code : error instanceof Error ? error.name : 'UNKNOWN';
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('Classroom Dify sync failed', {
      classroomId: input.classroomId,
      triggerSource: input.triggerSource,
      mutationMode,
      datasetId: config.datasetId,
      documentId: activeDocumentId,
      documentName: activeDocumentName,
      batchId,
      contentHash: serialized.contentHash,
      errorCode,
      errorMessage,
    });

    return updateClassroomDifySyncRecord(input.classroomId, (existing) => ({
      ...(existing || queued),
      metadata: serialized.metadata,
      triggerSource: input.triggerSource,
      status: 'failed',
      documentId: activeDocumentId,
      documentName: activeDocumentName,
      documentCreatedAt: activeDocumentCreatedAt,
      batchId,
      errorCode,
      errorMessage,
      updatedAt: nowIso(),
    }));
  }
}

export function enqueueClassroomDifySync(input: {
  classroomId: string;
  triggerSource: ClassroomPublishTriggerSource;
  force?: boolean;
}): Promise<ClassroomDifySyncRecord> {
  const existing = runningSyncs.get(input.classroomId);
  if (existing) {
    log.info('Queued follow-up Dify sync behind in-flight classroom sync', {
      classroomId: input.classroomId,
      triggerSource: input.triggerSource,
      force: Boolean(input.force),
    });
    pendingSyncs.set(input.classroomId, {
      triggerSource: input.triggerSource,
      force: input.force || pendingSyncs.get(input.classroomId)?.force,
    });
    return existing;
  }

  const promise = runSync(input)
    .catch(async (error) => {
      log.error('Failed to sync classroom to Dify', {
        classroomId: input.classroomId,
        triggerSource: input.triggerSource,
        error,
      });
      const current = await getClassroomDifySyncStatus(input.classroomId);
      return current.status === 'failed'
        ? current
        : updateClassroomDifySyncRecord(input.classroomId, (existingRecord) => ({
            ...(existingRecord || current),
            status: 'failed',
            triggerSource: input.triggerSource,
            errorCode: error instanceof Error ? error.name : 'UNKNOWN',
            errorMessage: error instanceof Error ? error.message : String(error),
            updatedAt: nowIso(),
          }));
    })
    .finally(() => {
      runningSyncs.delete(input.classroomId);
      const pending = pendingSyncs.get(input.classroomId);
      if (pending) {
        pendingSyncs.delete(input.classroomId);
        log.info('Starting queued follow-up Dify sync after in-flight sync completed', {
          classroomId: input.classroomId,
          triggerSource: pending.triggerSource,
          force: Boolean(pending.force),
        });
        void enqueueClassroomDifySync({
          classroomId: input.classroomId,
          triggerSource: pending.triggerSource,
          force: pending.force,
        });
      }
    });

  log.info('Enqueued classroom Dify sync', {
    classroomId: input.classroomId,
    triggerSource: input.triggerSource,
    force: Boolean(input.force),
  });
  runningSyncs.set(input.classroomId, promise);
  return promise;
}
