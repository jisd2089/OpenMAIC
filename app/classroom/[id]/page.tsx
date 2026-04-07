'use client';

import { Brain, ChevronDown, Copy, Database, Download, Film, SlidersHorizontal } from 'lucide-react';
import { Stage } from '@/components/stage';
import { ClassroomOpsPanel } from '@/components/classroom/classroom-ops-panel';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import {
  buildGenerationContextExport,
  extractSceneKnowledgeAssets,
} from '@/lib/export/context-export';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { parseGenerationParamsStorage } from '@/lib/generation/session-storage';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { PdfImage } from '@/lib/types/generation';
import type { GenerationContextSummary } from '@/lib/types/stage';
import type { ChatAreaExtraTab } from '@/components/chat/chat-area';
import {
  hasGenerationContextSummary,
  mergeGenerationContextSummary,
} from '@/lib/context/generation-context';
import { buildClassroomPath, normalizeClassroomView } from '@/lib/classroom/view';

const log = createLogger('Classroom');

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ClassroomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const classroomId = params?.id as string;
  const { t } = useI18n();
  const classroomView = normalizeClassroomView(searchParams?.get('view'));

  const { loadFromStorage } = useStageStore();
  const currentScene = useStageStore((state) => state.getCurrentScene());
  const currentSceneKnowledgeAssets = currentScene ? extractSceneKnowledgeAssets(currentScene) : [];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextSummary, setContextSummary] = useState<GenerationContextSummary | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  const generationStartedRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const handleDownloadContext = useCallback(() => {
    const { stage, scenes } = useStageStore.getState();
    const fileName = stage?.name || 'slides';
    const blob = new Blob([JSON.stringify(buildGenerationContextExport(stage, scenes), null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    saveAs(blob, `${fileName}.context.json`);
    toast.success(t('export.contextJsonDownloaded'));
  }, [t]);

  const handleCopyContext = useCallback(async () => {
    try {
      const { stage, scenes } = useStageStore.getState();
      const payload = JSON.stringify(buildGenerationContextExport(stage, scenes), null, 2);
      await navigator.clipboard.writeText(payload);
      toast.success(t('export.contextJsonCopied'));
    } catch (error) {
      log.error('Failed to copy context JSON:', error);
      toast.error(t('export.contextJsonCopyFailed'));
    }
  }, [t]);

  const handleCopyCurrentSceneContext = useCallback(async () => {
    try {
      const scene = useStageStore.getState().getCurrentScene();
      if (!scene?.generationContext) return;
      const payload = JSON.stringify(
        {
          sceneId: scene.id,
          title: scene.title,
          order: scene.order,
          generationContext: scene.generationContext,
        },
        null,
        2,
      );
      await navigator.clipboard.writeText(payload);
      toast.success(t('context.currentSceneCopied'));
    } catch (error) {
      log.error('Failed to copy current scene context:', error);
      toast.error(t('context.currentSceneCopyFailed'));
    }
  }, [t]);

  const handleCopyCurrentSceneRetrieval = useCallback(async () => {
    try {
      const scene = useStageStore.getState().getCurrentScene();
      const retrievalText = scene?.generationContext?.retrievalContext?.trim();
      if (!retrievalText) return;
      await navigator.clipboard.writeText(retrievalText);
      toast.success(t('context.retrievalTextCopied'));
    } catch (error) {
      log.error('Failed to copy retrieval text:', error);
      toast.error(t('context.retrievalTextCopyFailed'));
    }
  }, [t]);

  const handleSwitchView = useCallback(
    (view: 'teacher' | 'student') => {
      router.push(buildClassroomPath(classroomId, view));
    },
    [classroomId, router],
  );

  const handleCopyStudentLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${buildClassroomPath(classroomId, 'student')}`,
      );
      toast.success(t('classroom.studentLinkCopied'));
    } catch (error) {
      log.error('Failed to copy student classroom link:', error);
      toast.error(t('classroom.studentLinkCopyFailed'));
    }
  }, [classroomId, t]);

  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes } = json.classroom;
              useStageStore.getState().setStage(stage);
              useStageStore.setState({
                scenes,
                currentSceneId: scenes[0]?.id ?? null,
              });
              log.info('Loaded from server-side storage:', classroomId);
            }
          }
        } catch (fetchErr) {
          log.warn('Server-side storage fetch failed:', fetchErr);
        }
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // Restore agents for this stage
      const { loadGeneratedAgentsForStage, saveGeneratedAgents, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      let generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      if (generatedAgentIds.length === 0) {
        const stage = useStageStore.getState().stage;
        if (stage?.generatedAgents?.length) {
          generatedAgentIds = await saveGeneratedAgents(classroomId, stage.generatedAgents);
        }
      }
      const { useSettingsStore } = await import('@/lib/store/settings');
      if (generatedAgentIds.length > 0) {
        // Auto mode: use generated agents from IndexedDB
        useSettingsStore.getState().setAgentMode('auto');
        useSettingsStore.getState().setSelectedAgentIds(generatedAgentIds);
      } else {
        // Preset mode: restore agent IDs saved in the stage at creation time.
        // Filter out any stale generated IDs that may have been persisted before
        // the bleed-fix, so they don't resolve against a leftover registry entry.
        const stage = useStageStore.getState().stage;
        const stageAgentIds = stage?.agentIds;
        const registry = useAgentRegistry.getState();
        const cleanIds = stageAgentIds?.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        useSettingsStore.getState().setAgentMode('preset');
        useSettingsStore
          .getState()
          .setSelectedAgentIds(
            cleanIds && cleanIds.length > 0 ? cleanIds : ['default-1', 'default-2', 'default-3'],
          );
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  const reloadClassroomFromServer = useCallback(async () => {
    const res = await fetch(`/api/classroom/${encodeURIComponent(classroomId)}`, {
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok || !json.classroom) {
      throw new Error(json.error || 'Failed to reload classroom');
    }

    const { stage, scenes } = json.classroom;
    const { currentSceneId, workspaceMode } = useStageStore.getState();
    useStageStore.getState().setStage(stage);
    useStageStore.setState({
      scenes,
      workspaceMode,
      currentSceneId: scenes.some((scene: { id: string }) => scene.id === currentSceneId)
        ? currentSceneId
        : (scenes[0]?.id ?? null),
    });
    setContextSummary(stage.generationContext ?? null);
    await useStageStore.getState().saveToStorage();
  }, [classroomId]);

  const classroomOpsTabs = useMemo<ChatAreaExtraTab[]>(
    () =>
      classroomView === 'teacher'
        ? [
            {
              value: 'classroom-ops',
              label: t('classroomOps.title'),
              icon: <SlidersHorizontal className="w-3.5 h-3.5" />,
              content: (
                <ClassroomOpsPanel classroomId={classroomId} onReload={reloadClassroomFromServer} />
              ),
            },
          ]
        : [],
    [classroomId, classroomView, reloadClassroomFromServer, t],
  );

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // Check if there are pending outlines
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));

    const rawGenerationParams = sessionStorage.getItem('generationParams');
    const parsedGenerationParams = parseGenerationParamsStorage(rawGenerationParams);
    if (!parsedGenerationParams && rawGenerationParams) {
      sessionStorage.removeItem('generationParams');
    }
    const params = parsedGenerationParams;
    const stageContext = stage?.generationContext;
    const sessionContext = params
      ? {
          scopeId: params.scopeId,
          knowledgeBaseIds: params.knowledgeBaseIds,
          memoryIds: params.memoryIds,
          selectedKnowledgeBases: params.selectedKnowledgeBases,
          selectedMemories: params.selectedMemories,
          enableKnowledgeRetrieval: params.enableKnowledgeRetrieval,
          enableMemoryRetrieval: params.enableMemoryRetrieval,
          preferKnowledgeVideos: params.preferKnowledgeVideos,
        }
      : null;
    const effectiveContext = mergeGenerationContextSummary(sessionContext, stageContext);
    const pdfImages = (params?.pdfImages as PdfImage[] | undefined) ?? undefined;
    const agents = (params?.agents as AgentInfo[] | undefined) ?? undefined;

    setContextSummary(effectiveContext);

    if (hasPending && stage) {
      generationStartedRef.current = true;

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      const storageIds = (pdfImages || [])
        .map((img) => img.storageId)
        .filter((storageId): storageId is string => Boolean(storageId));

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages,
          imageMapping,
          scopeId: effectiveContext?.scopeId,
          knowledgeBaseIds: effectiveContext?.knowledgeBaseIds,
          memoryIds: effectiveContext?.memoryIds,
          enableKnowledgeRetrieval: effectiveContext?.enableKnowledgeRetrieval,
          enableMemoryRetrieval: effectiveContext?.enableMemoryRetrieval,
          preferKnowledgeVideos: effectiveContext?.preferKnowledgeVideos,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            language: stage.language,
            style: stage.style,
          },
          agents,
          userProfile: params?.userProfile,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      generationStartedRef.current = true;
      generateMediaForOutlines(outlines, stage.id).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
      });
    }
  }, [loading, error, generateRemaining]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="relative h-screen flex flex-col overflow-hidden">
          <div className="absolute top-4 left-1/2 z-40 -translate-x-1/2">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/70 bg-white/85 px-3 py-2 shadow-lg backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85">
              <button
                onClick={() => handleSwitchView('teacher')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  classroomView === 'teacher'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {t('classroom.teacherView')}
              </button>
              <button
                onClick={() => handleSwitchView('student')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  classroomView === 'student'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {t('classroom.studentView')}
              </button>
              <button
                onClick={() => void handleCopyStudentLink()}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Copy className="size-3.5" />
                {t('classroom.copyStudentLink')}
              </button>
            </div>
          </div>
          {contextSummary &&
          hasGenerationContextSummary(contextSummary) ? (
            <div className="absolute top-4 right-4 z-40 max-w-sm">
              <div className="rounded-2xl border border-white/70 bg-white/85 shadow-lg backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85">
                <button
                  onClick={() => setContextOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                    <div className="min-w-0">
                      <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        {t('context.title')}
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {(contextSummary.selectedKnowledgeBases?.length ||
                          contextSummary.knowledgeBaseIds?.length ||
                          0) +
                          (contextSummary.selectedMemories?.length ||
                            contextSummary.memoryIds?.length ||
                            0)}{' '}
                        {t('context.sourcesActive')}
                      </div>
                    </div>
                  <ChevronDown
                    className={`size-4 text-slate-500 transition-transform ${contextOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {contextOpen ? (
                  <div className="space-y-4 border-t border-slate-200/80 px-4 py-4 dark:border-slate-700/80">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleDownloadContext}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Download className="size-3.5" />
                        {t('context.downloadJson')}
                      </button>
                      <button
                        onClick={() => void handleCopyContext()}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Copy className="size-3.5" />
                        {t('context.copyJson')}
                      </button>
                    </div>

                    {contextSummary.preferKnowledgeVideos ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300">
                        <Film className="size-3.5" />
                        {t('context.preferKnowledgeVideos')}
                      </div>
                    ) : null}

                    {(contextSummary.selectedKnowledgeBases?.length ||
                      contextSummary.knowledgeBaseIds?.length) ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          <Database className="size-3.5" />
                          {t('context.knowledgeBases')}
                        </div>
                        {contextSummary.selectedKnowledgeBases?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {contextSummary.selectedKnowledgeBases.map((item) => (
                              <span
                                key={item.id}
                                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
                              >
                                {item.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {contextSummary.knowledgeBaseIds?.length || 0} {t('context.knowledgeBaseIdsLoaded')}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {(contextSummary.selectedMemories?.length ||
                      contextSummary.memoryIds?.length) ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          <Brain className="size-3.5" />
                          {t('context.memoryNotes')}
                        </div>
                        {contextSummary.selectedMemories?.length ? (
                          <div className="space-y-2">
                            {contextSummary.selectedMemories.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                              >
                                <div className="font-medium">{item.category}</div>
                                <div className="mt-1 line-clamp-2 text-[11px] opacity-80">
                                  {item.contentPreview}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {contextSummary.memoryIds?.length || 0} {t('context.memoryIdsLoaded')}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          {t('context.currentScene')}
                        </div>
                        {currentScene?.generationContext ? (
                          <div className="flex flex-wrap gap-1.5">
                            {currentScene.generationContext.retrievalContext ? (
                              <button
                                onClick={() => void handleCopyCurrentSceneRetrieval()}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                <Copy className="size-3" />
                                {t('context.copyRetrievalText')}
                              </button>
                            ) : null}
                            <button
                              onClick={() => void handleCopyCurrentSceneContext()}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <Copy className="size-3" />
                              {t('context.copyCurrentScene')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {currentScene?.generationContext ? (
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {currentScene.title}
                          </div>
                          {currentScene.generationContext.retrievalContext ? (
                            <div className="space-y-1">
                              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                {t('context.retrievalContext')}
                              </div>
                              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-700 dark:text-slate-300">
                                {currentScene.generationContext.retrievalContext}
                              </div>
                            </div>
                          ) : null}
                          {currentScene.generationContext.knowledgeVideoReferences?.length ? (
                            <div className="space-y-1">
                              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                {t('context.videoCandidates')}
                              </div>
                              <div className="space-y-2">
                                {currentScene.generationContext.knowledgeVideoReferences.map((item) => (
                                  <div
                                    key={item.fileId}
                                    className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-[11px] text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200"
                                  >
                                    <div className="font-medium">{item.filename}</div>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] opacity-80">
                                      {typeof item.score === 'number' ? (
                                        <span>
                                          {t('context.score')}: {item.score.toFixed(3)}
                                        </span>
                                      ) : null}
                                      {formatDuration(item.durationMs) ? (
                                        <span>
                                          {t('context.duration')}: {formatDuration(item.durationMs)}
                                        </span>
                                      ) : null}
                                      {item.width && item.height ? (
                                        <span>
                                          {item.width}x{item.height}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {currentSceneKnowledgeAssets.length > 0 ? (
                            <div className="space-y-1">
                              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                {t('context.knowledgeAssets')}
                              </div>
                              <div className="space-y-2">
                                {currentSceneKnowledgeAssets.map((item) => (
                                  <div
                                    key={`${item.elementId}:${item.fileId}`}
                                    className="rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-2 text-[11px] text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full border border-blue-300/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] dark:border-blue-800/70">
                                        {item.kind}
                                      </span>
                                      <span className="font-medium">{t('context.elementId')}: {item.elementId}</span>
                                    </div>
                                    <div className="mt-1 text-[10px] opacity-85">
                                      {t('context.fileId')}: {item.fileId}
                                    </div>
                                    <div className="mt-1 break-all text-[10px] opacity-75">
                                      {t('context.source')}: {item.resolvedSrc}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          {t('context.currentSceneEmpty')}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage
              classroomId={classroomId}
              classroomView={classroomView}
              onRetryOutline={retrySingleOutline}
              rightPanelExtraTabs={classroomOpsTabs}
            />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}

