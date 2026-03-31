'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  History,
  LoaderCircle,
  MonitorPlay,
  PencilLine,
  Save,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';
import { ensureClassroomPersisted } from '@/lib/classroom/ensure-classroom-persisted';
import { createLogger } from '@/lib/logger';
import type {
  ClassroomRegenerationJobSummary,
  ClassroomRevisionSummary,
} from '@/lib/server/classroom/types';

const log = createLogger('ClassroomOpsPanel');

interface ClassroomOpsPanelProps {
  classroomId: string;
  onReload: () => Promise<void>;
}

async function pollJson<T>(
  url: string,
  isDone: (payload: T) => boolean,
  messages?: { requestFailed?: string; timeout?: string },
  timeoutMs = 20000,
  options?: {
    intervalMs?: number;
    onTick?: (payload: T) => void;
  },
) {
  const started = Date.now();
  const intervalMs = options?.intervalMs ?? 500;
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || messages?.requestFailed || 'Request failed');
    }
    options?.onTick?.(json as T);
    if (isDone(json as T)) {
      return json as T;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(messages?.timeout || 'Timed out waiting for background job');
}

export function ClassroomOpsPanel({ classroomId, onReload }: ClassroomOpsPanelProps) {
  const { t } = useI18n();
  const stage = useStageStore((state) => state.stage);
  const scenes = useStageStore((state) => state.scenes);
  const currentScene = useStageStore((state) => state.getCurrentScene());
  const setCurrentSceneId = useStageStore((state) => state.setCurrentSceneId);
  const currentSceneId = useStageStore((state) => state.currentSceneId);
  const workspaceMode = useStageStore((state) => state.workspaceMode);
  const setWorkspaceMode = useStageStore((state) => state.setWorkspaceMode);
  const showRegenerationPreview = useStageStore((state) => state.showRegenerationPreview);
  const setRegenerationPreviewSceneIds = useStageStore(
    (state) => state.setRegenerationPreviewSceneIds,
  );
  const setRegenerationPreviewScenes = useStageStore((state) => state.setRegenerationPreviewScenes);
  const setShowRegenerationPreview = useStageStore((state) => state.setShowRegenerationPreview);
  const [busy, setBusy] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ClassroomRevisionSummary[]>([]);
  const [reworkPrompt, setReworkPrompt] = useState('');
  const [regenerationJob, setRegenerationJob] = useState<ClassroomRegenerationJobSummary | null>(null);

  const handleWorkspaceModeToggle = useCallback(() => {
    const nextMode = workspaceMode === 'edit' ? 'present' : 'edit';
    if (nextMode === 'edit') {
      setShowRegenerationPreview(false);
    }
    setWorkspaceMode(nextMode);
  }, [setShowRegenerationPreview, setWorkspaceMode, workspaceMode]);

  const handlePreviewCanvasToggle = useCallback(() => {
    if (!showRegenerationPreview) {
      setWorkspaceMode('present');
    }
    setShowRegenerationPreview(!showRegenerationPreview);
  }, [setShowRegenerationPreview, setWorkspaceMode, showRegenerationPreview]);

  const regenerationTargetLabel = useMemo(() => {
    if (!regenerationJob) return null;
    if (regenerationJob.targetType === 'scene') return t('classroomOps.targetScene');
    if (regenerationJob.targetType === 'selection') return t('classroomOps.targetSelection');
    return t('classroomOps.targetClassroom');
  }, [regenerationJob, t]);

  const regenerationPreviewItems = useMemo(() => {
    if (!regenerationJob?.preview?.changedSceneIds?.length) return [];
    const previewScenes = new Map((regenerationJob.preview.scenes || []).map((scene) => [scene.id, scene]));
    const currentScenes = new Map(scenes.map((scene) => [scene.id, scene]));

    return regenerationJob.preview.changedSceneIds.map((sceneId) => {
      const currentScene = currentScenes.get(sceneId);
      const previewScene = previewScenes.get(sceneId);
      return {
        sceneId,
        currentScene,
        previewScene,
      };
    });
  }, [regenerationJob, scenes]);

  const currentTargetPreviewReady = useMemo(() => {
    if (!currentSceneId) return false;
    return regenerationPreviewItems.some((item) => item.sceneId === currentSceneId);
  }, [currentSceneId, regenerationPreviewItems]);

  const revisionLabel = useMemo(() => {
    if (revisions.length === 0) return t('classroomOps.noRevisions');
    return t('classroomOps.revisionsCount').replace('{count}', String(revisions.length));
  }, [revisions.length, t]);

  const loadRevisions = useCallback(async () => {
    try {
      const res = await fetch(`/api/classroom/${classroomId}/revisions?page=1&pageSize=5`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || t('classroomOps.loadRevisionsFailed'));
      }
      setRevisions(json.revisions || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('classroomOps.loadRevisionsFailed'));
    }
  }, [classroomId, t]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  const saveClassroom = useCallback(
    async (saveMode: 'draft' | 'publish') => {
      setBusy(saveMode);
      try {
        const res = await fetch(`/api/classroom/${classroomId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            stage,
            scenes,
            saveMode,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || t('classroomOps.saveFailed'));
        }
        toast.success(saveMode === 'draft' ? t('classroomOps.draftSaved') : t('classroomOps.published'));
        await onReload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('classroomOps.saveFailed'));
      } finally {
        setBusy(null);
      }
    },
    [classroomId, onReload, scenes, stage, t],
  );

  const createRevision = useCallback(async () => {
    setBusy('revision');
    try {
      const res = await fetch(`/api/classroom/${classroomId}/revisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'manual-save',
          summary: `${t('classroomOps.snapshotSummaryPrefix')}: ${stage?.name || classroomId}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || t('classroomOps.createRevisionFailed'));
      }
      toast.success(t('classroomOps.revisionCreated'));
      await loadRevisions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('classroomOps.createRevisionFailed'));
    } finally {
      setBusy(null);
    }
  }, [classroomId, loadRevisions, stage?.name, t]);

  const restoreRevision = useCallback(
    async (revisionId: string) => {
      setBusy(`restore:${revisionId}`);
      try {
        const res = await fetch(`/api/classroom/${classroomId}/revisions/${revisionId}/restore`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || t('classroomOps.restoreRevisionFailed'));
        }
        toast.success(t('classroomOps.revisionRestored'));
        await onReload();
        await loadRevisions();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('classroomOps.restoreRevisionFailed'));
      } finally {
        setBusy(null);
      }
    },
    [classroomId, loadRevisions, onReload, t],
  );

  const exportPackage = useCallback(async () => {
    setBusy('export');
    try {
      const createRes = await fetch(`/api/classroom/${classroomId}/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          includeAssets: true,
          includeContext: true,
          includeRevisions: true,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createJson.error || t('classroomOps.exportCreateFailed'));
      }

      const status = await pollJson<{ job: { status: string; result?: { downloadUrl: string } } }>(
        `/api/classroom/${classroomId}/export/${createJson.jobId}`,
        (payload) => payload.job.status === 'succeeded',
        {
          requestFailed: t('classroomOps.requestFailed'),
          timeout: t('classroomOps.backgroundJobTimeout'),
        },
      );
      if (!status.job.result?.downloadUrl) {
        throw new Error(t('classroomOps.exportFileNotReady'));
      }
      window.location.assign(status.job.result.downloadUrl);
      toast.success(t('classroomOps.exportReady'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('classroomOps.exportFailed'));
    } finally {
      setBusy(null);
    }
  }, [classroomId, t]);

  const startRegeneration = useCallback(
    async (targetType: 'scene' | 'classroom') => {
      if (!reworkPrompt.trim()) {
        toast.error(t('classroomOps.enterReworkPrompt'));
        return;
      }
      if (targetType === 'scene' && !currentScene) {
        toast.error(t('classroomOps.noCurrentScene'));
        return;
      }

      setBusy(`regenerate:${targetType}`);
      if (workspaceMode === 'edit') {
        setWorkspaceMode('present');
      }
      setRegenerationJob(null);
      setRegenerationPreviewSceneIds([]);
      setRegenerationPreviewScenes([]);
      setShowRegenerationPreview(false);
      try {
        toast.loading(t('classroomOps.preparingClassroomForRework'), {
          id: 'classroom-ops-persist-before-regenerate',
        });
        await ensureClassroomPersisted({
          classroomId,
          stage,
          scenes,
        });
        toast.dismiss('classroom-ops-persist-before-regenerate');

        const createRes = await fetch(`/api/classroom/${classroomId}/regenerate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetType,
            targetId: targetType === 'scene' ? currentScene?.id : undefined,
            prompt: reworkPrompt.trim(),
            regenerateMode: 'full',
            preserveManualEdits: true,
            knowledgeBaseIds: stage?.generationContext?.knowledgeBaseIds || [],
            memoryIds: stage?.generationContext?.memoryIds || [],
            scopeId: stage?.generationContext?.scopeId,
          }),
        });
        const createJson = await createRes.json();
        if (!createRes.ok) {
          throw new Error(createJson.error || t('classroomOps.createRegenerationFailed'));
        }

        const now = new Date().toISOString();
        setRegenerationJob({
          id: createJson.jobId,
          classroomId,
          status: createJson.status,
          step: createJson.step,
          message: createJson.message,
          targetType,
          targetId: targetType === 'scene' ? currentScene?.id : undefined,
          regenerateMode: 'full',
          preserveManualEdits: true,
          prompt: reworkPrompt.trim(),
          createdAt: now,
          updatedAt: now,
        });

        const status = await pollJson<{ job: ClassroomRegenerationJobSummary }>(
          `/api/classroom/${classroomId}/regenerate/${createJson.jobId}`,
          (payload) => payload.job.status === 'preview-ready' || payload.job.status === 'failed',
          {
            requestFailed: t('classroomOps.requestFailed'),
            timeout: t('classroomOps.backgroundJobTimeout'),
          },
          180000,
          {
            intervalMs: 1000,
            onTick: (payload) => {
              setRegenerationJob(payload.job);
            },
          },
        );
        if (status.job.status !== 'preview-ready') {
          throw new Error(status.job.error || t('classroomOps.regenerationPreviewFailed'));
        }
        setRegenerationJob(status.job);
        setRegenerationPreviewSceneIds(status.job.preview?.changedSceneIds || []);
        setRegenerationPreviewScenes(status.job.preview?.scenes || []);
        setShowRegenerationPreview(true);
        toast.success(t('classroomOps.regenerationPreviewReady'));
      } catch (error) {
        toast.dismiss('classroom-ops-persist-before-regenerate');
        setRegenerationPreviewSceneIds([]);
        setRegenerationPreviewScenes([]);
        setShowRegenerationPreview(false);
        log.error('Failed to prepare classroom before regeneration', {
          classroomId,
          targetType,
          currentSceneId: currentScene?.id,
          error,
        });
        toast.error(
          error instanceof Error
            ? error.message
            : t('classroomOps.prepareClassroomFailed'),
        );
      } finally {
        setBusy(null);
      }
    },
    [
      classroomId,
      scenes,
      currentScene,
      reworkPrompt,
      setRegenerationPreviewSceneIds,
      setRegenerationPreviewScenes,
      setShowRegenerationPreview,
      stage,
      t,
      workspaceMode,
      setWorkspaceMode,
    ],
  );

  const applyRegeneration = useCallback(async () => {
    if (!regenerationJob) return;
    setBusy('apply-regeneration');
    try {
      const res = await fetch(
        `/api/classroom/${classroomId}/regenerate/${regenerationJob.id}/apply`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ createRevision: true }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || t('classroomOps.applyRegenerationFailed'));
      }
      setRegenerationJob(null);
      setRegenerationPreviewSceneIds([]);
      setRegenerationPreviewScenes([]);
      setShowRegenerationPreview(false);
      toast.success(t('classroomOps.regenerationApplied'));
      await onReload();
      await loadRevisions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('classroomOps.applyRegenerationFailed'));
    } finally {
      setBusy(null);
    }
  }, [
    classroomId,
    loadRevisions,
    onReload,
    regenerationJob,
    setRegenerationPreviewSceneIds,
    setRegenerationPreviewScenes,
    setShowRegenerationPreview,
    t,
  ]);

  const discardRegeneration = useCallback(async () => {
    if (!regenerationJob) return;
    setBusy('discard-regeneration');
    try {
      const res = await fetch(
        `/api/classroom/${classroomId}/regenerate/${regenerationJob.id}/discard`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || t('classroomOps.discardRegenerationFailed'));
      }
      setRegenerationJob(null);
      setRegenerationPreviewSceneIds([]);
      setRegenerationPreviewScenes([]);
      setShowRegenerationPreview(false);
      toast.success(t('classroomOps.regenerationDiscarded'));
    } catch (error) {
      log.error('Failed to discard classroom regeneration preview', {
        classroomId,
        regenerationJobId: regenerationJob.id,
        error,
      });
      toast.error(error instanceof Error ? error.message : t('classroomOps.discardRegenerationFailed'));
    } finally {
      setBusy(null);
    }
  }, [
    classroomId,
    regenerationJob,
    setRegenerationPreviewSceneIds,
    setRegenerationPreviewScenes,
    setShowRegenerationPreview,
    t,
  ]);

  useEffect(() => {
    return () => {
      setRegenerationPreviewSceneIds([]);
      setRegenerationPreviewScenes([]);
      setShowRegenerationPreview(false);
    };
  }, [
    setRegenerationPreviewSceneIds,
    setRegenerationPreviewScenes,
    setShowRegenerationPreview,
  ]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 scrollbar-hide">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {t('classroomOps.title')}
        </div>
        <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
          {t('classroomOps.subtitle')}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {t('classroomOps.currentTarget')}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {t('classroomOps.currentTargetHint')}
            </div>
          </div>
          <BookOpen className="mt-0.5 size-4 text-slate-400" />
        </div>
        {currentScene ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {currentScene.order + 1}. {currentScene.title}
              </div>
              {currentTargetPreviewReady ? (
                <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                  {t('classroomOps.currentTargetPreviewReady')}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {t('classroomOps.currentTargetType')}: {currentScene.type}
            </div>
            <div className="mt-3">
              <button
                onClick={handleWorkspaceModeToggle}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100 dark:hover:bg-emerald-950/30"
              >
                {workspaceMode === 'edit' ? (
                  <MonitorPlay className="size-3.5" />
                ) : (
                  <PencilLine className="size-3.5" />
                )}
                {workspaceMode === 'edit'
                  ? t('classroomOps.returnToPlayback')
                  : t('classroomOps.editCurrentScene')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t('classroomOps.currentTargetEmpty')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void saveClassroom('draft')}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Save className="size-4" />
          {t('classroomOps.saveDraft')}
        </button>
        <button
          onClick={() => void saveClassroom('publish')}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <UploadCloud className="size-4" />
          {t('classroomOps.publish')}
        </button>
        <button
          onClick={() => void createRevision()}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <History className="size-4" />
          {t('classroomOps.snapshot')}
        </button>
        <button
          onClick={() => void exportPackage()}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Download className="size-4" />
          {t('classroomOps.export')}
        </button>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          {t('classroomOps.promptRework')}
        </div>
        <textarea
          value={reworkPrompt}
          onChange={(event) => setReworkPrompt(event.target.value)}
          rows={4}
          placeholder={t('classroomOps.promptPlaceholder')}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void startRegeneration('scene')}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Sparkles className="size-4" />
            {t('classroomOps.reworkScene')}
          </button>
          <button
            onClick={() => void startRegeneration('classroom')}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Sparkles className="size-4" />
            {t('classroomOps.reworkCourse')}
          </button>
        </div>
        {regenerationJob && regenerationJob.status !== 'preview-ready' ? (
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/40">
                  <LoaderCircle className="size-4 animate-spin text-amber-600 dark:text-amber-300" />
                </div>
                <div>
                  <div className="font-medium">{t('classroomOps.regenerationInProgress')}</div>
                  <div className="mt-1 text-[11px] opacity-80">
                    {regenerationJob.message || t('classroomOps.regenerationWaitingHint')}
                  </div>
                </div>
              </div>
              <span className="rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {regenerationJob.step}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/30">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 dark:from-amber-500 dark:via-orange-400 dark:to-amber-300" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="text-[11px] uppercase tracking-[0.12em] opacity-70">
                  {t('classroomOps.previewTarget')}
                </div>
                <div className="mt-1 font-medium">{regenerationTargetLabel}</div>
              </div>
              <div className="rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="text-[11px] uppercase tracking-[0.12em] opacity-70">
                  {t('classroomOps.previewPrompt')}
                </div>
                <div className="mt-1 line-clamp-3 text-[11px] opacity-90">
                  {regenerationJob.prompt}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {regenerationJob?.status === 'preview-ready' ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-xs text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-100">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{t('classroomOps.previewReady')}</div>
              <button
                onClick={handlePreviewCanvasToggle}
                className="rounded-full border border-violet-300 px-2.5 py-1 text-[10px] font-medium transition hover:bg-violet-100 dark:border-violet-800 dark:hover:bg-violet-900/30"
              >
                {showRegenerationPreview
                  ? t('classroomOps.hidePreviewCanvas')
                  : t('classroomOps.showPreviewCanvas')}
              </button>
            </div>
            <div className="mt-1 opacity-80">
              {t('classroomOps.scenesChanged').replace(
                '{count}',
                String(regenerationJob.preview?.changedSceneIds?.length || 0),
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-violet-200/80 bg-white/70 px-3 py-2 dark:border-violet-900/40 dark:bg-violet-950/20">
                <div className="text-[11px] uppercase tracking-[0.12em] opacity-70">
                  {t('classroomOps.previewTarget')}
                </div>
                <div className="mt-1 font-medium">{regenerationTargetLabel}</div>
              </div>
              <div className="rounded-lg border border-violet-200/80 bg-white/70 px-3 py-2 dark:border-violet-900/40 dark:bg-violet-950/20">
                <div className="text-[11px] uppercase tracking-[0.12em] opacity-70">
                  {t('classroomOps.previewPrompt')}
                </div>
                <div className="mt-1 line-clamp-3 text-[11px] opacity-90">
                  {regenerationJob.prompt}
                </div>
              </div>
            </div>
            {regenerationJob.preview?.stage ? (
              <div className="mt-3 rounded-lg border border-violet-200/80 bg-white/70 px-3 py-2 text-[11px] dark:border-violet-900/40 dark:bg-violet-950/20">
                {t('classroomOps.previewStageUpdated')}
              </div>
            ) : null}
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-[0.12em] opacity-70">
                {t('classroomOps.previewChanges')}
              </div>
              {regenerationPreviewItems.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {regenerationPreviewItems.map(({ sceneId, currentScene, previewScene }) => {
                    const isViewing = currentSceneId === sceneId;
                    return (
                      <div
                        key={sceneId}
                        className={
                          isViewing
                            ? 'rounded-lg border border-violet-400 bg-violet-100/90 px-3 py-2 dark:border-violet-700 dark:bg-violet-900/30'
                            : 'rounded-lg border border-violet-200/80 bg-white/70 px-3 py-2 dark:border-violet-900/40 dark:bg-violet-950/20'
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">
                            {previewScene?.order ?? currentScene?.order ?? '-'} -{' '}
                            {previewScene?.title || currentScene?.title || sceneId}
                          </div>
                          <div className="flex items-center gap-2">
                            {isViewing ? (
                              <span className="rounded-full border border-violet-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] dark:border-violet-700">
                                {t('classroomOps.previewViewing')}
                              </span>
                            ) : null}
                            <button
                              onClick={() => setCurrentSceneId(sceneId)}
                              className="rounded-full border border-violet-300 px-2.5 py-1 text-[10px] font-medium transition hover:bg-violet-100 dark:border-violet-800 dark:hover:bg-violet-900/30"
                            >
                              {t('classroomOps.previewJump')}
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] opacity-80">
                          {t('classroomOps.previewCurrentTitle')}:{' '}
                          {currentScene?.title || t('classroomOps.previewUnavailable')}
                        </div>
                        <div className="text-[11px] opacity-80">
                          {t('classroomOps.previewNextTitle')}:{' '}
                          {previewScene?.title || t('classroomOps.previewUnavailable')}
                        </div>
                        <div className="mt-1 text-[11px] opacity-80">
                          {t('classroomOps.previewType')}: {currentScene?.type || '-'} {'->'}{' '}
                          {previewScene?.type || currentScene?.type || '-'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-violet-200/80 bg-white/70 px-3 py-2 text-[11px] opacity-80 dark:border-violet-900/40 dark:bg-violet-950/20">
                  {t('classroomOps.previewUnavailable')}
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void applyRegeneration()}
                disabled={busy !== null}
                className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('classroomOps.applyPreview')}
              </button>
              <button
                onClick={() => void discardRegeneration()}
                disabled={busy !== null}
                className="rounded-full border border-violet-300 px-3 py-1 text-xs font-medium text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-900/30"
              >
                {t('classroomOps.discardPreview')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t('classroomOps.revisions')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{revisionLabel}</div>
        </div>
        {revisions.length > 0 ? (
          <div className="space-y-2">
            {revisions.map((revision) => (
              <div
                key={revision.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <div className="font-medium">{revision.summary || revision.source}</div>
                <div className="mt-1 text-[11px] opacity-70">
                  {new Date(revision.createdAt).toLocaleString()}
                </div>
                <button
                  onClick={() => void restoreRevision(revision.id)}
                  disabled={busy !== null}
                  className="mt-2 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t('classroomOps.restore')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t('classroomOps.noSavedRevisions')}
          </div>
        )}
      </div>
    </div>
  );
}




