'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Database,
  Film,
  ImagePlus,
  Pencil,
  Trash2,
  Settings,
  Sun,
  Moon,
  Monitor,
  BotOff,
  ChevronUp,
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { AgentBar } from '@/components/agent/agent-bar';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  getFirstSlideByStages,
} from '@/lib/utils/stage-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';
import type { SelectedKnowledgeBaseSummary, SelectedMemorySummary } from '@/lib/types/stage';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { Checkbox } from '@/components/ui/checkbox';
import { DEFAULT_SCOPE_ID } from '@/lib/constants/scope';
import { buildGenerationSessionStorage } from '@/lib/generation/session-storage';
import type { KnowledgeBaseSummary } from '@/lib/server/kb/contracts';
import type { MemoryNoteSummary } from '@/lib/server/memory/contracts';
import { buildClassroomPath } from '@/lib/classroom/view';

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const KB_SELECTION_STORAGE_KEY = 'generationKnowledgeBaseIds';
const MEMORY_SELECTION_STORAGE_KEY = 'generationMemoryIds';
const PREFER_KB_VIDEO_STORAGE_KEY = 'generationPreferKnowledgeVideos';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
}

type CourseImportPhase = 'idle' | 'uploading' | 'validating' | 'applying' | 'failed' | 'completed';

interface CourseImportStatus {
  phase: CourseImportPhase;
  fileName?: string;
  jobId?: string;
  classroomId?: string;
  message?: string;
  error?: string;
  warnings?: string[];
}

type ClassroomListItem = StageListItem;

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'zh-CN',
  webSearch: false,
};

function HomePage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const importCourseInputRef = useRef<HTMLInputElement | null>(null);
  const [courseImportStatus, setCourseImportStatus] = useState<CourseImportStatus>({ phase: 'idle' });
  const [courseImportErrorExpanded, setCourseImportErrorExpanded] = useState(false);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // Model setup state
  const currentModelId = useSettingsStore((s) => s.modelId);
  const [recentOpen, setRecentOpen] = useState(true);

  // Hydrate client-only state after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const savedKnowledgeBaseIds = localStorage.getItem(KB_SELECTION_STORAGE_KEY);
      const savedMemoryIds = localStorage.getItem(MEMORY_SELECTION_STORAGE_KEY);
      const savedPreferKnowledgeVideos = localStorage.getItem(PREFER_KB_VIDEO_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedLanguage === 'zh-CN' || savedLanguage === 'en-US') {
        updates.language = savedLanguage;
      } else {
        const detected = navigator.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
        updates.language = detected;
      }
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
      if (savedKnowledgeBaseIds) {
        setSelectedKnowledgeBaseIds(JSON.parse(savedKnowledgeBaseIds) as string[]);
      }
      if (savedMemoryIds) {
        setSelectedMemoryIds(JSON.parse(savedMemoryIds) as string[]);
      }
      if (savedPreferKnowledgeVideos !== null) {
        setPreferKnowledgeVideos(savedPreferKnowledgeVideos !== 'false');
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Restore requirement draft from cache (derived state pattern - no effect needed)
  const [prevCachedRequirement, setPrevCachedRequirement] = useState(cachedRequirement);
  if (cachedRequirement !== prevCachedRequirement) {
    setPrevCachedRequirement(cachedRequirement);
    if (cachedRequirement) {
      setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
    }
  }

  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [retrievalPanelOpen, setRetrievalPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [knowledgeBaseOptions, setKnowledgeBaseOptions] = useState<KnowledgeBaseSummary[]>([]);
  const [memoryNoteOptions, setMemoryNoteOptions] = useState<MemoryNoteSummary[]>([]);
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [preferKnowledgeVideos, setPreferKnowledgeVideos] = useState(true);
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState('');
  const [memoryFilter, setMemoryFilter] = useState('');
  const [knowledgeOnlySelected, setKnowledgeOnlySelected] = useState(false);
  const [memoryOnlySelected, setMemoryOnlySelected] = useState(false);
  const [loadingRetrievalOptions, setLoadingRetrievalOptions] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const filteredKnowledgeBaseOptions = useMemo(() => {
    const keyword = knowledgeBaseFilter.trim().toLowerCase();
    const items = [...knowledgeBaseOptions].sort((a, b) => {
      const aSelected = selectedKnowledgeBaseIds.includes(a.id) ? 1 : 0;
      const bSelected = selectedKnowledgeBaseIds.includes(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return b.updatedAt - a.updatedAt;
    });
    const filtered = items.filter(
      (item) =>
        (!keyword ||
          item.name.toLowerCase().includes(keyword) ||
          item.description?.toLowerCase().includes(keyword)) &&
        (!knowledgeOnlySelected || selectedKnowledgeBaseIds.includes(item.id)),
    );
    return filtered;
  }, [
    knowledgeBaseFilter,
    knowledgeBaseOptions,
    knowledgeOnlySelected,
    selectedKnowledgeBaseIds,
  ]);
  const filteredMemoryOptions = useMemo(() => {
    const keyword = memoryFilter.trim().toLowerCase();
    const items = [...memoryNoteOptions].sort((a, b) => {
      const aSelected = selectedMemoryIds.includes(a.id) ? 1 : 0;
      const bSelected = selectedMemoryIds.includes(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
      return b.updatedAt - a.updatedAt;
    });
    const filtered = items.filter(
      (item) =>
        (!keyword ||
          item.content.toLowerCase().includes(keyword) ||
          item.category.toLowerCase().includes(keyword)) &&
        (!memoryOnlySelected || selectedMemoryIds.includes(item.id)),
    );
    return filtered;
  }, [memoryFilter, memoryNoteOptions, memoryOnlySelected, selectedMemoryIds]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!languageOpen && !themeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setLanguageOpen(false);
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [languageOpen, themeOpen]);

  const loadClassrooms = async () => {
    try {
      const [localList, serverResponse] = await Promise.all([
        listStages(),
        fetch('/api/classroom', { cache: 'no-store' }).catch(() => null),
      ]);

      const serverPayload = serverResponse
        ? ((await serverResponse.json().catch(() => null)) as
            | { success?: boolean; classrooms?: ClassroomListItem[] }
            | null)
        : null;
      const serverList =
        serverResponse?.ok && serverPayload?.success && Array.isArray(serverPayload.classrooms)
          ? serverPayload.classrooms
          : [];

      const merged = new Map<string, ClassroomListItem>();
      for (const item of serverList) {
        merged.set(item.id, item);
      }
      for (const item of localList) {
        merged.set(item.id, item);
      }
      const list = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setClassrooms(list);
      // Load first slide thumbnails
      if (list.length > 0) {
        const localIds = new Set(localList.map((item) => item.id));
        const slides = await getFirstSlideByStages(
          list.filter((item) => localIds.has(item.id)).map((c) => c.id),
        );
        setThumbnails(slides);
      } else {
        setThumbnails({});
      }
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  const loadRetrievalOptions = async () => {
    setLoadingRetrievalOptions(true);
    try {
      const [kbRes, memoryRes] = await Promise.all([
        fetch(`/api/kb?scopeId=${encodeURIComponent(DEFAULT_SCOPE_ID)}&page=1&pageSize=100`),
        fetch(
          `/api/memory?scopeId=${encodeURIComponent(DEFAULT_SCOPE_ID)}&page=1&pageSize=100`,
        ),
      ]);

      const kbData = (await kbRes.json().catch(() => null)) as
        | { success: true; items: KnowledgeBaseSummary[] }
        | null;
      const memoryData = (await memoryRes.json().catch(() => null)) as
        | { success: true; items: MemoryNoteSummary[] }
        | null;

      const nextKnowledgeBases = kbData?.success ? kbData.items : [];
      const nextMemories = memoryData?.success ? memoryData.items : [];
      setKnowledgeBaseOptions(nextKnowledgeBases);
      setMemoryNoteOptions(nextMemories);
      setSelectedKnowledgeBaseIds((current) =>
        current.filter((id) => nextKnowledgeBases.some((item) => item.id === id)),
      );
      setSelectedMemoryIds((current) =>
        current.filter((id) => nextMemories.some((item) => item.id === id)),
      );
    } catch (err) {
      log.error('Failed to load retrieval options:', err);
    } finally {
      setLoadingRetrievalOptions(false);
    }
  };

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    loadClassrooms();
    loadRetrievalOptions();
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      const response = await fetch(`/api/classroom/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; errorCode?: string }
        | null;

      if (!response.ok && payload?.errorCode !== 'CLASSROOM_NOT_FOUND') {
        throw new Error(payload?.error || 'Failed to delete classroom');
      }

      await deleteStageData(id);
      await loadClassrooms();
      toast.success(t('classroom.deleteSuccess'));
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error(t('classroom.deleteFailed'));
    }
  };

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(KB_SELECTION_STORAGE_KEY, JSON.stringify(selectedKnowledgeBaseIds));
      localStorage.setItem(MEMORY_SELECTION_STORAGE_KEY, JSON.stringify(selectedMemoryIds));
      localStorage.setItem(PREFER_KB_VIDEO_STORAGE_KEY, String(preferKnowledgeVideos));
    } catch {
      /* ignore */
    }
  }, [preferKnowledgeVideos, selectedKnowledgeBaseIds, selectedMemoryIds]);

  const toggleSelection = (id: string, current: string[], setter: (value: string[]) => void) => {
    setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const showSetupToast = (icon: React.ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="w-[356px] rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 via-white to-amber-50 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/60 shadow-lg shadow-amber-500/8 dark:shadow-amber-900/20 p-4 flex items-start gap-3 cursor-pointer"
          onClick={() => {
            toast.dismiss(id);
            setSettingsOpen(true);
          }}
        >
          <div className="shrink-0 mt-0.5 size-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center ring-1 ring-amber-200/50 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              {title}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5 leading-relaxed">
              {desc}
            </p>
          </div>
          <div className="shrink-0 mt-1 text-[10px] font-medium text-amber-500 dark:text-amber-500/70 tracking-wide">
            <Settings className="size-3.5 animate-[spin_3s_linear_infinite]" />
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const pollImportJob = async (jobId: string, fileName: string) => {
    const started = Date.now();
    while (Date.now() - started < 20000) {
      const res = await fetch(`/api/classroom/import/${encodeURIComponent(jobId)}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || t('home.importQueryFailed'));
      }
      const job = json.job as {
        status: string;
        message?: string;
        error?: string;
        validation?: { warnings?: string[] };
      };
      setCourseImportStatus({
        phase: job.status === 'failed' ? 'failed' : 'validating',
        fileName,
        jobId,
        message: job.message || t('home.importValidatingMessage'),
        warnings: job.validation?.warnings || [],
        error: job.status === 'failed' ? job.error || t('home.importValidationFailed') : undefined,
      });
      if (job.status === 'validated' || job.status === 'failed') {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(t('home.importValidationTimeout'));
  };

  const handleImportCourse = async (file: File) => {
    setCourseImportErrorExpanded(false);
    setCourseImportStatus({
      phase: 'uploading',
      fileName: file.name,
      message: t('home.importUploadingMessage'),
      warnings: [],
    });
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('strategy', 'create-new');

      const createRes = await fetch('/api/classroom/import', {
        method: 'POST',
        body: formData,
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createJson.error || t('home.importCreateFailed'));
      }

      setCourseImportStatus({
        phase: 'validating',
        fileName: file.name,
        jobId: createJson.jobId as string,
        message: t('home.importValidatingMessage'),
        warnings: [],
      });

      const job = await pollImportJob(createJson.jobId as string, file.name);
      if (job.status !== 'validated') {
        throw new Error(job.error || t('home.importValidationFailed'));
      }

      setCourseImportStatus({
        phase: 'applying',
        fileName: file.name,
        jobId: createJson.jobId as string,
        message: t('home.importApplyingMessage'),
        warnings: job.validation?.warnings || [],
      });

      const applyRes = await fetch(`/api/classroom/import/${encodeURIComponent(createJson.jobId)}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const applyJson = await applyRes.json();
      if (!applyRes.ok) {
        throw new Error(applyJson.error || t('home.importApplyFailed'));
      }

      setCourseImportStatus({
        phase: 'completed',
        fileName: file.name,
        jobId: createJson.jobId as string,
        classroomId: applyJson.classroomId as string,
        message: t('home.importSuccessMessage'),
        warnings: job.validation?.warnings || [],
      });
      toast.success(t('home.importSuccessToast'));
      await loadClassrooms();
      await new Promise((resolve) => setTimeout(resolve, 900));
      router.push(`/classroom/${applyJson.classroomId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('home.importFailedMessage');
      log.error('Failed to import course package:', err);
      setCourseImportStatus((current) => ({
        ...current,
        phase: 'failed',
        error: message,
        message: current.message || t('home.importFailedMessage'),
      }));
      setCourseImportErrorExpanded(true);
      toast.error(message);
    } finally {
      if (importCourseInputRef.current) {
        importCourseInputRef.current.value = '';
      }
    }
  };

  const handleGenerate = async () => {
    // Validate setup before proceeding
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      setSettingsOpen(true);
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        language: form.language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (form.pdfFile) {
        pdfStorageKey = await storePdfBlob(form.pdfFile);
        pdfFileName = form.pdfFile.name;

        const settings = useSettingsStore.getState();
        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
          };
        }
      }

      const sessionState = buildGenerationSessionStorage({
        sessionId: nanoid(),
        requirements,
        scopeId: DEFAULT_SCOPE_ID,
        knowledgeBaseIds: selectedKnowledgeBaseIds,
        memoryIds: selectedMemoryIds,
        selectedKnowledgeBases: knowledgeBaseOptions
          .filter((item) => selectedKnowledgeBaseIds.includes(item.id))
          .map(
            (item): SelectedKnowledgeBaseSummary => ({
              id: item.id,
              name: item.name,
            }),
          ),
        selectedMemories: memoryNoteOptions
          .filter((item) => selectedMemoryIds.includes(item.id))
          .map(
            (item): SelectedMemorySummary => ({
              id: item.id,
              category: item.category,
              contentPreview: item.content.slice(0, 120),
            }),
          ),
        enableKnowledgeRetrieval: selectedKnowledgeBaseIds.length > 0,
        enableMemoryRetrieval: selectedMemoryIds.length > 0,
        preferKnowledgeVideos,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      });
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const importingCourse = ['uploading', 'validating', 'applying'].includes(
    courseImportStatus.phase,
  );

  const courseImportProgress =
    courseImportStatus.phase === 'uploading'
      ? 20
      : courseImportStatus.phase === 'validating'
        ? 55
        : courseImportStatus.phase === 'applying'
          ? 85
          : courseImportStatus.phase === 'completed'
            ? 100
            : 0;

  const canGenerate = !!form.requirement.trim();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleGenerate();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 pt-16 md:p-8 md:pt-16 overflow-x-hidden">
      <input
        ref={importCourseInputRef}
        type="file"
        accept=".zip,.omaic-course.zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImportCourse(file);
          }
        }}
      />
      {/* Top-right pill (unchanged) */}
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-50 flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm"
      >
        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setLanguageOpen(!languageOpen);
              setThemeOpen(false);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {locale === 'zh-CN' ? 'CN' : 'EN'}
          </button>
          {languageOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[120px]">
              <button
                onClick={() => {
                  setLocale('zh-CN');
                  setLanguageOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  locale === 'zh-CN' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                简体中文
              </button>
              <button
                onClick={() => {
                  setLocale('en-US');
                  setLanguageOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  locale === 'en-US' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                English
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setThemeOpen(!themeOpen);
              setLanguageOpen(false);
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </button>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
              <button
                onClick={() => {
                  setTheme('light');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'light' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Sun className="w-4 h-4" />
                {t('settings.themeOptions.light')}
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'dark' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Moon className="w-4 h-4" />
                {t('settings.themeOptions.dark')}
              </button>
              <button
                onClick={() => {
                  setTheme('system');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'system' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Monitor className="w-4 h-4" />
                {t('settings.themeOptions.system')}
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Settings Button */}
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
          >
            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* Background decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* Hero section: title + input (centered, wider) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(
          'relative z-20 w-full max-w-[800px] flex flex-col items-center',
          classrooms.length === 0 ? 'justify-center min-h-[calc(100dvh-8rem)]' : 'mt-[10vh]',
        )}
      >
        <motion.h1
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="mb-2 text-3xl font-black tracking-[0.18em] text-slate-900 dark:text-slate-100 md:text-5xl"
        >
          iotek
        </motion.h1>

        {/* Slogan */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm text-muted-foreground/60 mb-8"
        >
          {t('home.slogan')}
        </motion.p>

        {/* Unified input area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 transition-shadow focus-within:shadow-2xl focus-within:shadow-violet-500/[0.06]">
            {/* Greeting + profile + agents */}
            <div className="relative z-20 flex items-start justify-between">
              <GreetingBar />
              <div className="pr-3 pt-3.5 shrink-0">
                <AgentBar />
              </div>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder={t('upload.requirementPlaceholder')}
              className="w-full resize-none border-0 bg-transparent px-4 pt-1 pb-2 text-[13px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none min-h-[140px] max-h-[300px]"
              value={form.requirement}
              onChange={(e) => updateForm('requirement', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
            />

            {/* Toolbar row */}
            <div className="px-3 pb-3 flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <GenerationToolbar
                  language={form.language}
                  onLanguageChange={(lang) => updateForm('language', lang)}
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={form.pdfFile}
                  onPdfFileChange={(f) => updateForm('pdfFile', f)}
                  onPdfError={setError}
                />
              </div>

              <button
                onClick={() => setRetrievalPanelOpen((open) => !open)}
                className="shrink-0 h-8 rounded-lg border border-border/60 bg-background/80 px-3 text-xs font-medium text-foreground/75 transition hover:bg-background hover:text-foreground"
              >
                {`Context ${selectedKnowledgeBaseIds.length + selectedMemoryIds.length}`}
              </button>

              <button
                onClick={() => router.push('/knowledge')}
                className="shrink-0 h-8 rounded-lg border border-border/60 bg-background/80 px-3 text-xs font-medium text-foreground/75 transition hover:bg-background hover:text-foreground"
              >
                Workspace
              </button>


              <button
                onClick={() => importCourseInputRef.current?.click()}
                disabled={importingCourse}
                className="shrink-0 h-8 rounded-lg border border-border/60 bg-background/80 px-3 text-xs font-medium text-foreground/75 transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <UploadCloud className="size-3.5" />
                {importingCourse ? t('home.importingCourse') : t('home.importCourse')}
              </button>
              {/* Voice input */}
              <SpeechButton
                size="md"
                onTranscription={(text) => {
                  setForm((prev) => {
                    const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                    updateRequirementCache(next);
                    return { ...prev, requirement: next };
                  });
                }}
              />

              {/* Send button */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  'shrink-0 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all px-3',
                  canGenerate
                    ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm cursor-pointer'
                    : 'bg-muted text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                <ArrowUp className="size-3.5" />
              </button>
            </div>

            {courseImportStatus.phase !== 'idle' ? (
              <div className="mx-3 mb-3 rounded-2xl border border-border/60 bg-background/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {courseImportStatus.phase === 'failed' ? (
                        <AlertCircle className="size-4 text-destructive" />
                      ) : courseImportStatus.phase === 'completed' ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <Loader2 className="size-4 animate-spin text-blue-600" />
                      )}
                      <span>
                        {courseImportStatus.phase === 'uploading'
                          ? t('home.importStatusUploading')
                          : courseImportStatus.phase === 'validating'
                            ? t('home.importStatusValidating')
                            : courseImportStatus.phase === 'applying'
                              ? t('home.importStatusApplying')
                              : courseImportStatus.phase === 'completed'
                                ? t('home.importComplete')
                                : t('home.importFailed')}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {courseImportStatus.fileName || t('home.importPackageDefault')}
                      {courseImportStatus.jobId
                        ? ` - ${t('home.importJobLabel')} ${courseImportStatus.jobId}`
                        : ''}
                      {courseImportStatus.classroomId
                        ? ` - ${t('home.importClassroomLabel')} ${courseImportStatus.classroomId}`
                        : ''}
                    </div>
                    {courseImportStatus.message ? (
                      <div className="mt-2 text-xs text-foreground/80">{courseImportStatus.message}</div>
                    ) : null}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        { key: 'uploading', label: t('home.importStepUpload'), active: courseImportProgress >= 20 },
                        { key: 'validating', label: t('home.importStepValidate'), active: courseImportProgress >= 55 },
                        {
                          key: 'applying',
                          label: t('home.importStepApply'),
                          active: courseImportProgress >= 85 || courseImportStatus.phase === 'completed',
                        },
                      ].map((step) => (
                        <div
                          key={step.key}
                          className={cn(
                            'rounded-lg border px-2 py-1 text-[11px] font-medium transition',
                            step.active
                              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200'
                              : 'border-border/60 bg-background/60 text-muted-foreground',
                          )}
                        >
                          {step.label}
                        </div>
                      ))}
                    </div>
                    {courseImportStatus.phase !== 'failed' && courseImportStatus.phase !== 'completed' ? (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${courseImportProgress}%` }}
                        />
                      </div>
                    ) : null}
                    {courseImportStatus.warnings?.length ? (
                      <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                        <div className="font-medium">{t('home.importWarnings')}</div>
                        <ul className="mt-1 space-y-1">
                          {courseImportStatus.warnings.map((warning, index) => (
                            <li key={`${warning}-${index}`}>- {warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {courseImportStatus.error ? (
                      <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{t('home.importFailed')}</span>
                          <button
                            onClick={() => setCourseImportErrorExpanded((open) => !open)}
                            className="text-[11px] font-medium underline-offset-2 transition hover:underline"
                          >
                            {courseImportErrorExpanded ? t('home.importHideDetails') : t('home.importShowDetails')}
                          </button>
                        </div>
                        {courseImportErrorExpanded ? (
                          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[11px]">
                            {courseImportStatus.error}
                          </pre>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {(courseImportStatus.phase === 'failed' || courseImportStatus.phase === 'completed') ? (
                    <div className="flex items-center gap-2">
                      {courseImportStatus.phase === 'failed' ? (
                        <button
                          onClick={() => importCourseInputRef.current?.click()}
                          className="rounded-lg border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition hover:bg-muted"
                        >
                          {t('home.importRetry')}
                        </button>
                      ) : null}
                      <button
                        onClick={() => {
                          setCourseImportErrorExpanded(false);
                          setCourseImportStatus({ phase: 'idle' });
                        }}
                        className="rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <AnimatePresence>
              {retrievalPanelOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden border-t border-border/60"
                >
                  <div className="grid gap-3 px-3 py-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Database className="size-4" />
                          Knowledge Bases
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {selectedKnowledgeBaseIds.length} selected
                        </span>
                      </div>
                      <Input
                        value={knowledgeBaseFilter}
                        onChange={(event) => setKnowledgeBaseFilter(event.target.value)}
                        placeholder="Search knowledge bases"
                        className="mb-3 h-8 bg-background/80 text-xs"
                      />
                      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <label className="inline-flex items-center gap-2">
                          <Checkbox
                            checked={knowledgeOnlySelected}
                            onCheckedChange={(checked) =>
                              setKnowledgeOnlySelected(checked !== false)
                            }
                          />
                          Only selected
                        </label>
                        {selectedKnowledgeBaseIds.length > 0 ? (
                          <button
                            onClick={() => setSelectedKnowledgeBaseIds([])}
                            className="font-medium text-foreground/70 transition hover:text-foreground"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {filteredKnowledgeBaseOptions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                            {knowledgeBaseOptions.length === 0
                              ? 'No knowledge bases yet. Create them in Workspace.'
                              : 'No knowledge bases match the current filter.'}
                          </div>
                        ) : (
                          filteredKnowledgeBaseOptions.map((item) => (
                            <label
                              key={item.id}
                              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2"
                            >
                              <Checkbox
                                checked={selectedKnowledgeBaseIds.includes(item.id)}
                                onCheckedChange={() =>
                                  toggleSelection(
                                    item.id,
                                    selectedKnowledgeBaseIds,
                                    setSelectedKnowledgeBaseIds,
                                  )
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {item.name}
                                </div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {item.fileCount} files
                                  {item.description ? ` - ${item.description}` : ''}
                                </div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Brain className="size-4" />
                          Memory Notes
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {selectedMemoryIds.length} selected
                        </span>
                      </div>
                      <Input
                        value={memoryFilter}
                        onChange={(event) => setMemoryFilter(event.target.value)}
                        placeholder="Search memory notes"
                        className="mb-3 h-8 bg-background/80 text-xs"
                      />
                      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <label className="inline-flex items-center gap-2">
                          <Checkbox
                            checked={memoryOnlySelected}
                            onCheckedChange={(checked) =>
                              setMemoryOnlySelected(checked !== false)
                            }
                          />
                          Only selected
                        </label>
                        {selectedMemoryIds.length > 0 ? (
                          <button
                            onClick={() => setSelectedMemoryIds([])}
                            className="font-medium text-foreground/70 transition hover:text-foreground"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {filteredMemoryOptions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                            {memoryNoteOptions.length === 0
                              ? 'No memory notes yet. Create them in Workspace.'
                              : 'No memory notes match the current filter.'}
                          </div>
                        ) : (
                          filteredMemoryOptions.map((item) => (
                            <label
                              key={item.id}
                              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2"
                            >
                              <Checkbox
                                checked={selectedMemoryIds.includes(item.id)}
                                onCheckedChange={() =>
                                  toggleSelection(item.id, selectedMemoryIds, setSelectedMemoryIds)
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{item.category}</span>
                                  {item.isPinned && <span>pinned</span>}
                                </div>
                                <div className="mt-1 line-clamp-2 text-sm text-foreground">
                                  {item.content}
                                </div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3 text-xs text-muted-foreground">
                    <label className="inline-flex items-center gap-2">
                      <Checkbox
                        checked={preferKnowledgeVideos}
                        onCheckedChange={(checked) =>
                          setPreferKnowledgeVideos(checked !== false)
                        }
                      />
                      Prefer knowledge base videos
                    </label>
                    <button
                      onClick={() => void loadRetrievalOptions()}
                      className="font-medium text-foreground/70 transition hover:text-foreground"
                    >
                      {loadingRetrievalOptions ? 'Refreshing...' : 'Refresh sources'}
                    </button>
                    {selectedKnowledgeBaseIds.length > 0 || selectedMemoryIds.length > 0 ? (
                      <button
                        onClick={() => {
                          setSelectedKnowledgeBaseIds([]);
                          setSelectedMemoryIds([]);
                        }}
                        className="font-medium text-foreground/70 transition hover:text-foreground"
                      >
                        Clear all selections
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Recent classrooms - collapsible */}
      {classrooms.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-10 w-full max-w-6xl flex flex-col items-center"
        >
          {/* Trigger - divider-line with centered text */}
          <button
            onClick={() => {
              const next = !recentOpen;
              setRecentOpen(next);
              try {
                localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            className="group w-full flex items-center gap-4 py-2 cursor-pointer"
          >
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
            <span className="shrink-0 flex items-center gap-2 text-[13px] text-muted-foreground/60 group-hover:text-foreground/70 transition-colors select-none">
              <Clock className="size-3.5" />
              {t('classroom.recentClassrooms')}
              <span className="text-[11px] tabular-nums opacity-60">{classrooms.length}</span>
              <motion.div
                animate={{ rotate: recentOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <ChevronDown className="size-3.5" />
              </motion.div>
            </span>
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
          </button>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                <div className="pt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                  {classrooms.map((classroom, i) => (
                    <motion.div
                      key={classroom.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: i * 0.04,
                        duration: 0.35,
                        ease: 'easeOut',
                      }}
                    >
                      <ClassroomCard
                        classroom={classroom}
                        slide={thumbnails[classroom.id]}
                        formatDate={formatDate}
                        onDelete={handleDelete}
                        confirmingDelete={pendingDeleteId === classroom.id}
                        onConfirmDelete={() => confirmDelete(classroom.id)}
                        onCancelDelete={() => setPendingDeleteId(null)}
                        onClick={() => router.push(buildClassroomPath(classroom.id))}
                        onOpenStudentView={() =>
                          router.push(buildClassroomPath(classroom.id, 'student'))
                        }
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer - flows with content, at the very end */}
      <div className="mt-auto pt-12 pb-4 text-center text-xs text-muted-foreground/40">
        iotek Open Source Project
      </div>
    </div>
  );
}

// Greeting Bar - avatar + "Hi, Name", click to edit in-place
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || t('profile.defaultNickname');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} className="relative pl-4 pr-2 pt-3.5 pb-1 w-auto">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* Collapsed pill (always in flow) */}
      {!open && (
        <div
          className="flex items-center gap-2.5 cursor-pointer transition-all duration-200 group rounded-full px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]"
          onClick={() => setOpen(true)}
        >
          <div className="shrink-0 relative">
            <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-border/30 group-hover:ring-violet-400/60 dark:group-hover:ring-violet-400/40 transition-all duration-300">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-[7px] text-muted-foreground/70" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="leading-none select-none flex items-center gap-1">
                  <span>
                    <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                      {t('home.greeting')}
                    </span>
                    <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors">
                      {displayName}
                    </span>
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {t('profile.editTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Expanded panel (absolute, floating) */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* Row: avatar + name */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-violet-300/70 dark:ring-violet-500/40 transition-all duration-300">
                    <img src={avatar} alt="" className="size-full object-cover" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* Expandable content */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Classroom Card - clean, minimal style
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
  onOpenStudentView,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
  onOpenStudentView: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);

  const handleCopyStudentLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${buildClassroomPath(classroom.id, 'student')}`,
      );
      toast.success(t('classroom.studentLinkCopied'));
    } catch {
      toast.error(t('classroom.studentLinkCopyFailed'));
    }
  };

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail - large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">??</span>
            </div>
          </div>
        ) : null}

        {/* Delete - top-right, only on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info - outside the thumbnail */}
        <div className="mt-2.5 px-1 flex items-center gap-2">
          <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
            {classroom.sceneCount} {t('classroom.slides')} - {formatDate(classroom.updatedAt)}
          </span>
          {classroom.knowledgeBaseCount ? (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              <Database className="size-3" />
              {classroom.knowledgeBaseCount}
            </span>
          ) : null}
          {classroom.memoryCount ? (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Brain className="size-3" />
              {classroom.memoryCount}
            </span>
          ) : null}
          {classroom.preferKnowledgeVideos ? (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              <Film className="size-3" />
              video
            </span>
          ) : null}
          <Tooltip>
          <TooltipTrigger asChild>
            <p className="font-medium text-[15px] truncate text-foreground/90 min-w-0">
              {classroom.name}
            </p>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={4}
            className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
          >
            <div className="flex items-center gap-1.5">
              <span className="break-all">{classroom.name}</span>
              <button
                className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(classroom.name);
                  toast.success(t('classroom.nameCopied'));
                }}
              >
                <Copy className="size-3 opacity-60" />
              </button>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-2 px-1 flex items-center gap-2">
        <button
          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          onClick={(e) => {
            e.stopPropagation();
            onOpenStudentView();
          }}
        >
          {t('classroom.studentView')}
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          onClick={handleCopyStudentLink}
        >
          <Copy className="size-3" />
          {t('classroom.copyStudentLink')}
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}






