'use client';

import { useEffect, useMemo, useState } from 'react';
import { MonitorPlay, PencilLine, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { SlideEditor } from '@/components/slide-renderer/Editor';
import { useCanvasStore, useStageStore } from '@/lib/store';
import type { Action } from '@/lib/types/action';
import type {
  InteractiveContent,
  QuizContent,
  Scene,
} from '@/lib/types/stage';

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getNonSlideSummary(scene: Scene, t: ReturnType<typeof useI18n>['t']) {
  if (scene.type === 'quiz') {
    const content = scene.content as QuizContent;
    return t('classroomOps.editingQuizSummary').replace(
      '{count}',
      String(content.questions?.length ?? 0),
    );
  }

  if (scene.type === 'interactive') {
    const content = scene.content as InteractiveContent;
    return content.url || t('classroomOps.editingInteractiveSummary');
  }

  if (scene.type === 'pbl') {
    return t('classroomOps.editingPblSummary');
  }

  return scene.type;
}

export function ClassroomEditorWorkspace() {
  const { t } = useI18n();
  const currentScene = useStageStore((state) => state.getCurrentScene());
  const showRegenerationPreview = useStageStore((state) => state.showRegenerationPreview);
  const scenesCount = useStageStore((state) => state.scenes.length);
  const updateScene = useStageStore((state) => state.updateScene);
  const setWorkspaceMode = useStageStore((state) => state.setWorkspaceMode);
  const resetCanvasState = useCanvasStore((state) => state.resetCanvasState);
  const setToolbarState = useCanvasStore((state) => state.setToolbarState);
  const setWhiteboardOpen = useCanvasStore((state) => state.setWhiteboardOpen);
  const [contentDraft, setContentDraft] = useState('');
  const [actionsDraft, setActionsDraft] = useState('');

  useEffect(() => {
    setToolbarState('design');
    setWhiteboardOpen(false);
    resetCanvasState();

    return () => {
      resetCanvasState();
      setWhiteboardOpen(false);
    };
  }, [resetCanvasState, setToolbarState, setWhiteboardOpen]);

  useEffect(() => {
    if (!currentScene) {
      setContentDraft('');
      setActionsDraft('');
      return;
    }

    setActionsDraft(stringifyJson(currentScene.actions || []));
    if (currentScene.type === 'slide') {
      setContentDraft('');
      return;
    }

    setContentDraft(stringifyJson(currentScene.content));
  }, [currentScene]);

  const editingLabel = useMemo(() => {
    if (!currentScene) return t('classroomOps.editCurrentSceneEmpty');
    return t('classroomOps.editingSceneLabel')
      .replace('{index}', String(currentScene.order + 1))
      .replace('{title}', currentScene.title || t('classroomOps.untitledScene'));
  }, [currentScene, t]);

  const applySceneContent = () => {
    if (!currentScene || currentScene.type === 'slide') return;

    try {
      const parsed = JSON.parse(contentDraft) as Scene['content'];
      updateScene(currentScene.id, { content: parsed });
      toast.success(t('classroomOps.contentUpdated'));
    } catch {
      toast.error(t('classroomOps.invalidSceneContentJson'));
    }
  };

  const applySceneActions = () => {
    if (!currentScene) return;

    try {
      const parsed = JSON.parse(actionsDraft) as Action[];
      if (!Array.isArray(parsed)) {
        throw new Error('Actions must be an array');
      }
      updateScene(currentScene.id, { actions: parsed });
      toast.success(t('classroomOps.actionsUpdated'));
    } catch {
      toast.error(t('classroomOps.invalidActionsJson'));
    }
  };

  if (!currentScene) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
        {t('classroomOps.editCurrentSceneEmpty')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-slate-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
              <PencilLine className="size-3.5" />
              {t('classroomOps.editMode')}
            </div>
            <div className="mt-1 truncate text-base font-semibold">{editingLabel}</div>
            <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-100/80">
              {t('classroomOps.editModeHint').replace('{count}', String(scenesCount))}
            </div>
            <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-100/80">
              {t('classroomOps.editModeSaveHint')}
            </div>
            {showRegenerationPreview ? (
              <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-100/80">
                {t('classroomOps.editModePreviewHint')}
              </div>
            ) : null}
          </div>
          <button
            onClick={() => setWorkspaceMode('present')}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-white dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-950/40"
          >
            <MonitorPlay className="size-3.5" />
            {t('classroomOps.returnToPlayback')}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {t('classroomOps.canvasEditor')}
            </div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {currentScene.type === 'slide'
                ? t('classroomOps.canvasEditorHint')
                : getNonSlideSummary(currentScene, t)}
            </div>
          </div>

          <div className="h-[calc(100%-65px)] min-h-0">
            {currentScene.type === 'slide' ? (
              <SceneProvider>
                <SlideEditor mode="autonomous" />
              </SceneProvider>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('classroomOps.structuredEditorHint')}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {t('classroomOps.sceneMeta')}
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
              {t('classroomOps.sceneTitle')}
            </label>
            <input
              value={currentScene.title}
              onChange={(event) => updateScene(currentScene.id, { title: event.target.value })}
              placeholder={t('classroomOps.sceneTitlePlaceholder')}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <div>{t('classroomOps.sceneType')}: {currentScene.type}</div>
              <div className="mt-1">
                {t('classroomOps.sceneIndex')}: {currentScene.order + 1}
              </div>
            </div>
          </div>

          {currentScene.type !== 'slide' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {t('classroomOps.sceneContentJson')}
                </div>
                <button
                  onClick={applySceneContent}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Save className="size-3.5" />
                  {t('classroomOps.applyJson')}
                </button>
              </div>
              <textarea
                value={contentDraft}
                onChange={(event) => setContentDraft(event.target.value)}
                rows={14}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 font-mono text-xs text-slate-800 outline-none transition focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {t('classroomOps.sceneActionsJson')}
              </div>
              <button
                onClick={applySceneActions}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Save className="size-3.5" />
                {t('classroomOps.applyJson')}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {t('classroomOps.sceneActionsHint')}
            </div>
            <textarea
              value={actionsDraft}
              onChange={(event) => setActionsDraft(event.target.value)}
              rows={12}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 font-mono text-xs text-slate-800 outline-none transition focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
