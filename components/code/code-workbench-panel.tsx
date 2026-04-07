'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Code2,
  FileCode2,
  FolderOpen,
  Loader2,
  Play,
  Save,
  Square,
  TerminalSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  CodeDraftState,
  CodeExecutionSummary,
  CodeRuntimeSummary,
} from '@/lib/hooks/use-code-workbench';

function statusLabel(status?: CodeExecutionSummary['status']) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '运行中';
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '执行失败';
    case 'timed_out':
      return '执行超时';
    case 'stopped':
      return '已停止';
    default:
      return '未运行';
  }
}

function statusClassName(status?: CodeExecutionSummary['status']) {
  switch (status) {
    case 'queued':
    case 'running':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'failed':
    case 'timed_out':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';
    case 'stopped':
      return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

function SectionToggle({
  label,
  open,
  onClick,
  meta,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  meta?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <span>{label}</span>
      {meta ? <span className="text-[11px] text-slate-400 dark:text-slate-500">{meta}</span> : null}
      {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

function ResultSection({
  draft,
  runtime,
  execution,
  isRunning,
}: {
  draft: CodeDraftState | null;
  runtime: CodeRuntimeSummary | null;
  execution: CodeExecutionSummary | null;
  isRunning: boolean;
}) {
  if (!execution) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
        运行后会在这里显示终端输出或网页预览。
      </div>
    );
  }

  const isWebPreview = execution.previewMode === 'web' && execution.previewUrl;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">
          {runtime?.label ?? '--'}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">
          入口: {draft?.entrypoint ?? '--'}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">
          状态: {statusLabel(execution.status)}
        </span>
      </div>

      {isWebPreview ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
          <iframe
            title="Code Preview"
            src={execution.previewUrl ?? undefined}
            sandbox="allow-forms allow-modals allow-scripts"
            className="h-64 w-full bg-white"
          />
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-700">
          <div className="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            stdout
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-5 text-slate-100">
            {execution.stdout || (isRunning ? '执行中...' : '无标准输出')}
          </pre>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-700">
          <div className="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            stderr
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-5 text-rose-300">
            {execution.stderr || '无错误输出'}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function CodeWorkbenchPanel({
  sceneTitle,
  draft,
  runtimes,
  runtime,
  execution,
  isLoading,
  isSaving,
  isRunning,
  error,
  onLanguageChange,
  onEntrypointChange,
  onSelectFile,
  onChangeFileContent,
  onChangeStdin,
  onSave,
  onRun,
  onStop,
}: {
  sceneTitle: string;
  draft: CodeDraftState | null;
  runtimes: CodeRuntimeSummary[];
  runtime: CodeRuntimeSummary | null;
  execution: CodeExecutionSummary | null;
  isLoading: boolean;
  isSaving: boolean;
  isRunning: boolean;
  error: string | null;
  onLanguageChange: (language: CodeDraftState['language']) => void;
  onEntrypointChange: (entrypoint: string) => void;
  onSelectFile: (path: string) => void;
  onChangeFileContent: (content: string) => void;
  onChangeStdin: (stdin: string) => void;
  onSave: () => Promise<unknown>;
  onRun: () => Promise<unknown>;
  onStop: () => Promise<unknown>;
}) {
  const activeFile = draft?.files.find((file) => file.path === draft.activeFilePath) ?? null;
  const activeRuntime = useMemo(
    () => runtimes.find((item) => item.language === draft?.language) ?? runtime,
    [draft?.language, runtime, runtimes],
  );
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [stdinExpanded, setStdinExpanded] = useState(false);
  const [manualResultExpanded, setManualResultExpanded] = useState<boolean | null>(null);

  const resultExpanded = manualResultExpanded ?? Boolean(execution);
  const fileCount = draft?.files.length ?? 0;

  const handleRun = () => {
    setManualResultExpanded(true);
    void onRun();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Code2 className="size-4 text-cyan-600 dark:text-cyan-400" />
              <span>代码工作台</span>
            </div>
            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {sceneTitle || '未命名场景'}
            </div>
          </div>
          <span
            className={cn(
              'inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-medium',
              statusClassName(execution?.status),
            )}
          >
            {statusLabel(execution?.status)}
          </span>
        </div>

        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <Select
              value={draft?.language}
              onValueChange={(value) => onLanguageChange(value as CodeDraftState['language'])}
              disabled={isLoading || !draft}
            >
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900">
                <SelectValue placeholder="选择语言" />
              </SelectTrigger>
              <SelectContent>
                {runtimes.map((item) => (
                  <SelectItem key={item.language} value={item.language} disabled={!item.available}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={draft?.entrypoint}
              onValueChange={onEntrypointChange}
              disabled={isLoading || !draft}
            >
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900">
                <SelectValue placeholder="入口文件" />
              </SelectTrigger>
              <SelectContent>
                {draft?.files.map((file) => (
                  <SelectItem key={file.path} value={file.path}>
                    {file.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg justify-center gap-1.5"
              disabled={!draft || isLoading || isSaving}
              onClick={() => void onSave()}
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              保存
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-lg justify-center gap-1.5"
              disabled={!draft || isLoading || isRunning}
              onClick={handleRun}
            >
              {isRunning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              运行
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg justify-center gap-1.5"
              disabled={!isRunning}
              onClick={() => void onStop()}
            >
              <Square className="size-3.5" />
              停止
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <SectionToggle
            label="文件"
            open={filesExpanded}
            meta={fileCount > 0 ? `${fileCount}` : null}
            onClick={() => setFilesExpanded((current) => !current)}
          />
          <SectionToggle
            label="结果"
            open={resultExpanded}
            meta={execution ? statusLabel(execution.status) : null}
            onClick={() => setManualResultExpanded((current) => !(current ?? Boolean(execution)))}
          />
          <SectionToggle
            label="stdin"
            open={stdinExpanded}
            onClick={() => setStdinExpanded((current) => !current)}
          />
        </div>

        {!activeRuntime?.available && activeRuntime?.disabledReason ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            {activeRuntime.disabledReason}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          {filesExpanded ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <FolderOpen className="size-3.5" />
                文件列表
              </div>
              <div className="flex flex-wrap gap-2">
                {draft?.files.length ? (
                  draft.files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => onSelectFile(file.path)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition',
                        file.path === draft.activeFilePath
                          ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                      )}
                    >
                      <FileCode2 className="size-3.5" />
                      <span className="max-w-[180px] truncate">{file.path}</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    暂无文件
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {activeFile?.path ?? '未选择文件'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {activeRuntime?.label ?? '--'}
                </div>
              </div>
              <div className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {draft?.entrypoint ?? '--'}
              </div>
            </div>

            <div className="h-[min(54vh,680px)] min-h-[360px] bg-slate-950">
              <Textarea
                value={activeFile?.content ?? ''}
                onChange={(event) => onChangeFileContent(event.target.value)}
                spellCheck={false}
                disabled={!activeFile || isLoading}
                className="h-full min-h-full resize-none border-0 bg-slate-950 px-4 py-4 font-mono text-sm leading-6 text-slate-100 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {resultExpanded ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <TerminalSquare className="size-4 text-cyan-600 dark:text-cyan-400" />
                运行结果
              </div>
              <ResultSection
                draft={draft}
                runtime={activeRuntime}
                execution={execution}
                isRunning={isRunning}
              />
            </div>
          ) : null}

          {stdinExpanded ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                标准输入
              </div>
              <Textarea
                value={draft?.stdin ?? ''}
                onChange={(event) => onChangeStdin(event.target.value)}
                spellCheck={false}
                className="h-24 resize-none rounded-lg border-slate-200 bg-white font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
