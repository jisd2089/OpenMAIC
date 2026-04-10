'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  Cpu,
  Globe,
  House,
  MousePointer2,
  PanelLeftClose,
  PieChart,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useCanvasStore, useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import type { SceneType, SlideContent } from '@/lib/types/stage';
import { cn } from '@/lib/utils';

interface SceneSidebarProps {
  readonly collapsed: boolean;
  readonly onCollapseChange: (collapsed: boolean) => void;
  readonly onSceneSelect?: (sceneId: string) => void;
  readonly onRetryOutline?: (outlineId: string) => Promise<void>;
}

const RAIL_WIDTH = 96;
const PREVIEW_SIZE = 224;

function getSceneTypeIcon(type: SceneType) {
  const icons = {
    slide: BookOpen,
    quiz: PieChart,
    interactive: MousePointer2,
    pbl: Cpu,
  };
  return icons[type] || BookOpen;
}

function renderScenePreview(
  sceneType: SceneType,
  slideContent: SlideContent | null,
  viewportSize: number,
  viewportRatio: number,
) {
  const Icon = getSceneTypeIcon(sceneType);

  if (sceneType === 'slide' && slideContent) {
    return (
      <ThumbnailSlide
        slide={slideContent.canvas}
        viewportSize={viewportSize}
        viewportRatio={viewportRatio}
        size={PREVIEW_SIZE}
      />
    );
  }

  if (sceneType === 'quiz') {
    return (
      <div className="flex h-full w-full flex-col rounded-[24px] bg-gradient-to-br from-orange-50 to-amber-50 p-3 dark:from-orange-950/30 dark:to-amber-950/20">
        <div className="mb-2 h-2 w-3/4 rounded-full bg-orange-200/70 dark:bg-orange-700/30" />
        <div className="grid flex-1 grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={cn(
                'flex items-center gap-2 rounded-2xl border px-2',
                index === 1
                  ? 'border-orange-300/60 bg-orange-200/30 dark:border-orange-600/30 dark:bg-orange-500/15'
                  : 'border-orange-100/70 bg-white/70 dark:border-orange-900/30 dark:bg-white/5',
              )}
            >
              <div
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  index === 1
                    ? 'bg-orange-400 dark:bg-orange-500'
                    : 'bg-orange-200 dark:bg-orange-700/50',
                )}
              />
              <div
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  index === 1
                    ? 'bg-orange-300/70 dark:bg-orange-600/40'
                    : 'bg-orange-100/90 dark:bg-orange-800/30',
                )}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sceneType === 'interactive') {
    return (
      <div className="flex h-full w-full flex-col rounded-[24px] bg-gradient-to-br from-emerald-50 to-teal-50 p-3 dark:from-emerald-950/30 dark:to-teal-950/20">
        <div className="mb-2 flex items-center gap-2 border-b border-emerald-200/40 pb-2 dark:border-emerald-700/20">
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-red-300 dark:bg-red-500/60" />
            <div className="h-2 w-2 rounded-full bg-amber-300 dark:bg-amber-500/60" />
            <div className="h-2 w-2 rounded-full bg-green-300 dark:bg-green-500/60" />
          </div>
          <div className="h-2 flex-1 rounded-full bg-emerald-200/40 dark:bg-emerald-700/30" />
        </div>
        <div className="flex flex-1 gap-2">
          <div className="w-1/4 space-y-2 pt-1">
            {[1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-1.5 w-full rounded-full bg-emerald-200/60 dark:bg-emerald-700/30"
              />
            ))}
          </div>
          <div className="flex flex-1 items-center justify-center rounded-[20px] border border-emerald-200/40 bg-emerald-100/40 dark:border-emerald-700/20 dark:bg-emerald-800/20">
            <Globe className="h-8 w-8 text-emerald-300/80 dark:text-emerald-600/50" />
          </div>
        </div>
      </div>
    );
  }

  if (sceneType === 'pbl') {
    return (
      <div className="flex h-full w-full flex-col rounded-[24px] bg-gradient-to-br from-blue-50 to-indigo-50 p-3 dark:from-blue-950/30 dark:to-indigo-950/20">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded bg-blue-300 dark:bg-blue-600" />
          <div className="h-1.5 w-12 rounded-full bg-blue-200/60 dark:bg-blue-700/30" />
        </div>
        <div className="flex flex-1 gap-2 overflow-hidden">
          {[0, 1, 2].map((column) => (
            <div
              key={column}
              className="flex flex-1 flex-col gap-1.5 rounded-[18px] bg-white/60 p-2 dark:bg-white/5"
            >
              <div
                className={cn(
                  'mb-1 h-1.5 w-8 rounded-full',
                  column === 0
                    ? 'bg-blue-300/70'
                    : column === 1
                      ? 'bg-amber-300/70'
                      : 'bg-green-300/70',
                )}
              />
              {Array.from({ length: column === 0 ? 3 : column === 1 ? 2 : 1 }).map((_, card) => (
                <div
                  key={card}
                  className="h-8 w-full rounded-xl border border-blue-200/30 bg-blue-100/60 dark:border-blue-700/20 dark:bg-blue-800/20"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[24px] bg-slate-50 text-slate-300 dark:bg-slate-800 dark:text-slate-500">
      <Icon className="h-8 w-8" />
      <span className="text-[11px] font-bold uppercase tracking-[0.28em]">{sceneType}</span>
    </div>
  );
}

export function SceneSidebar({
  collapsed,
  onCollapseChange,
  onSceneSelect,
  onRetryOutline,
}: SceneSidebarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { scenes, currentSceneId, setCurrentSceneId, generatingOutlines, generationStatus } =
    useStageStore();
  const failedOutlines = useStageStore.use.failedOutlines();
  const regenerationPreviewSceneIds = useStageStore.use.regenerationPreviewSceneIds();
  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();
  const previewSceneIdSet = useMemo(
    () => new Set(regenerationPreviewSceneIds),
    [regenerationPreviewSceneIds],
  );
  const [retryingOutlineId, setRetryingOutlineId] = useState<string | null>(null);
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);

  const totalSceneCount = scenes.length + (generatingOutlines.length > 0 ? 1 : 0);
  const rawCurrentSceneIndex =
    currentSceneId === PENDING_SCENE_ID
      ? scenes.length
      : scenes.findIndex((scene) => scene.id === currentSceneId);
  const currentSceneNumber =
    totalSceneCount === 0 ? 0 : rawCurrentSceneIndex >= 0 ? rawCurrentSceneIndex + 1 : 1;

  const selectScene = (sceneId: string) => {
    if (onSceneSelect) {
      onSceneSelect(sceneId);
      return;
    }
    setCurrentSceneId(sceneId);
  };

  const handleRetryOutline = async (outlineId: string) => {
    if (!onRetryOutline) return;
    setRetryingOutlineId(outlineId);
    try {
      await onRetryOutline(outlineId);
    } finally {
      setRetryingOutlineId(null);
    }
  };

  return (
    <div
      style={{ width: collapsed ? 0 : RAIL_WIDTH }}
      className="relative shrink-0 overflow-visible border-r border-slate-200/70 bg-gradient-to-b from-white via-slate-50 to-slate-100/90 shadow-[6px_0_30px_rgba(15,23,42,0.04)] transition-[width] duration-300 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
    >
      <div className={cn('flex h-full w-full flex-col overflow-hidden', collapsed && 'hidden')}>
        <div className="flex shrink-0 flex-col items-center gap-3 px-3 pb-4 pt-4">
          <button
            onClick={() => router.push('/')}
            className="flex h-10 w-10 items-center justify-center rounded-[18px] border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
            title={t('generation.backToHome')}
          >
            <House className="h-4 w-4" />
          </button>
          <button
            onClick={() => onCollapseChange(true)}
            className="flex h-10 w-10 items-center justify-center rounded-[18px] border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 px-2">
          <div className="pointer-events-none absolute bottom-0 left-1/2 top-2 w-px -translate-x-1/2 bg-gradient-to-b from-slate-200 via-slate-300/80 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800" />
          <div
            data-testid="scene-list"
            className="relative z-10 flex h-full flex-col items-center gap-3 overflow-y-auto overflow-x-visible px-1 py-2 scrollbar-hide"
          >
            {scenes.map((scene, index) => {
              const isActive = currentSceneId === scene.id;
              const isPreviewChanged = previewSceneIdSet.has(scene.id);
              const SceneTypeIcon = getSceneTypeIcon(scene.type);
              const slideContent = scene.type === 'slide' ? (scene.content as SlideContent) : null;

              return (
                <div
                  key={scene.id}
                  data-testid="scene-item"
                  className="group relative flex w-full flex-col items-center"
                  onMouseEnter={() => setHoveredSceneId(scene.id)}
                  onMouseLeave={() =>
                    setHoveredSceneId((current) => (current === scene.id ? null : current))
                  }
                >
                  <button
                    type="button"
                    onClick={() => selectScene(scene.id)}
                    className="relative flex h-11 w-11 items-center justify-center rounded-full"
                    title={`${index + 1}. ${scene.title}`}
                    aria-label={`${index + 1}. ${scene.title}`}
                  >
                    <span
                      className={cn(
                        'absolute inset-0 rounded-full border transition-all duration-200',
                        isActive
                          ? 'border-fuchsia-300 bg-white shadow-[0_0_0_4px_rgba(217,70,239,0.14)] dark:border-fuchsia-400 dark:bg-slate-950'
                          : isPreviewChanged
                            ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40'
                            : 'border-slate-200/90 bg-white/80 group-hover:border-slate-300 group-hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:group-hover:border-slate-500 dark:group-hover:bg-slate-900',
                      )}
                    />
                    <span
                      className={cn(
                        'relative h-3.5 w-3.5 rounded-full transition-all duration-200',
                        isActive
                          ? 'bg-fuchsia-500 shadow-[0_0_0_4px_rgba(217,70,239,0.18)]'
                          : isPreviewChanged
                            ? 'bg-violet-500'
                            : 'bg-slate-300 group-hover:bg-slate-500 dark:bg-slate-600 dark:group-hover:bg-slate-400',
                      )}
                    />
                    {isPreviewChanged ? (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-600 shadow-sm dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300">
                        <Sparkles className="h-2.5 w-2.5" />
                      </span>
                    ) : null}
                  </button>

                  <span className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                    {index + 1}
                  </span>
                  <span data-testid="scene-title" className="sr-only">
                    {scene.title}
                  </span>

                  {hoveredSceneId === scene.id ? (
                    <div className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-40 hidden w-64 -translate-y-1/2 lg:block">
                      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
                              Page {index + 1}
                            </div>
                            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {scene.title}
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <SceneTypeIcon className="h-4 w-4" />
                          </div>
                        </div>
                        <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] border border-slate-200/70 bg-slate-50 shadow-inner dark:border-slate-800 dark:bg-slate-900">
                          {renderScenePreview(scene.type, slideContent, viewportSize, viewportRatio)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {generatingOutlines.length > 0 &&
              (() => {
                const outline = generatingOutlines[0];
                const isFailed = failedOutlines.some((failed) => failed.id === outline.id);
                const isRetrying = retryingOutlineId === outline.id;
                const isPaused = generationStatus === 'paused';
                const isActive = currentSceneId === PENDING_SCENE_ID;

                return (
                  <div
                    key={`generating-${outline.id}`}
                    className="group relative flex w-full flex-col items-center"
                    onMouseEnter={() => setHoveredSceneId(PENDING_SCENE_ID)}
                    onMouseLeave={() =>
                      setHoveredSceneId((current) => (current === PENDING_SCENE_ID ? null : current))
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isFailed) return;
                        selectScene(PENDING_SCENE_ID);
                      }}
                      className={cn(
                        'relative flex h-11 w-11 items-center justify-center rounded-full',
                        isFailed && 'cursor-default',
                      )}
                      title={outline.title}
                      aria-label={outline.title}
                    >
                      <span
                        className={cn(
                          'absolute inset-0 rounded-full border transition-all duration-200',
                          isFailed
                            ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30'
                            : isActive
                              ? 'border-fuchsia-300 bg-white shadow-[0_0_0_4px_rgba(217,70,239,0.14)] dark:border-fuchsia-400 dark:bg-slate-950'
                              : 'border-slate-200/90 bg-white/80 dark:border-slate-700 dark:bg-slate-900/70',
                        )}
                      />
                      {isFailed ? (
                        <AlertCircle className="relative h-4 w-4 text-red-500 dark:text-red-400" />
                      ) : (
                        <span
                          className={cn(
                            'relative h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600',
                            !isPaused && 'animate-pulse',
                            isActive && 'bg-fuchsia-500',
                          )}
                        />
                      )}
                    </button>

                    <span className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                      {scenes.length + 1}
                    </span>

                    {isFailed && onRetryOutline ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRetryOutline(outline.id);
                        }}
                        disabled={isRetrying}
                        className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        title={t('generation.retryScene')}
                      >
                        <RefreshCw className={cn('h-3 w-3', isRetrying && 'animate-spin')} />
                      </button>
                    ) : null}

                    {hoveredSceneId === PENDING_SCENE_ID ? (
                      <div className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-40 hidden w-64 -translate-y-1/2 lg:block">
                        <div
                          className={cn(
                            'overflow-hidden rounded-[28px] border bg-white/95 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur dark:bg-slate-950/95',
                            isFailed
                              ? 'border-red-200/80 dark:border-red-900/60'
                              : 'border-slate-200/80 dark:border-slate-700',
                          )}
                        >
                          <div className="mb-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
                              Page {scenes.length + 1}
                            </div>
                            <div
                              className={cn(
                                'truncate text-sm font-semibold',
                                isFailed
                                  ? 'text-red-600 dark:text-red-300'
                                  : 'text-slate-800 dark:text-slate-100',
                              )}
                            >
                              {outline.title}
                            </div>
                          </div>

                          <div
                            className={cn(
                              'relative aspect-[16/10] overflow-hidden rounded-[24px] border',
                              isFailed
                                ? 'border-red-100 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20'
                                : 'border-slate-200/70 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
                            )}
                          >
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                              {isFailed ? (
                                <>
                                  <AlertCircle className="h-6 w-6 text-red-500 dark:text-red-400" />
                                  <span className="text-xs font-medium text-red-600 dark:text-red-300">
                                    {isRetrying
                                      ? t('generation.retryingScene')
                                      : t('stage.generationFailed')}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <div
                                    className={cn(
                                      'h-2.5 w-2/3 rounded-full bg-slate-200 dark:bg-slate-700',
                                      !isPaused && 'animate-pulse',
                                    )}
                                  />
                                  <div
                                    className={cn(
                                      'h-2 w-1/2 rounded-full bg-slate-200 dark:bg-slate-700',
                                      !isPaused && 'animate-pulse',
                                    )}
                                  />
                                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                                    {isPaused ? t('stage.paused') : t('stage.generating')}
                                  </span>
                                </>
                              )}
                            </div>
                            {!isFailed && !isPaused ? (
                              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/10" />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-4 pt-3">
          <div className="rounded-[22px] border border-white/70 bg-white/75 px-3 py-3 text-center shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
            <div className="text-lg font-semibold leading-none text-slate-700 dark:text-slate-100">
              {currentSceneNumber}/{totalSceneCount}
            </div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
              slides
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
