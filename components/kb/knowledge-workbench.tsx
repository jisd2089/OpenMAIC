'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Brain,
  Database,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Pin,
  PinOff,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_SCOPE_ID } from '@/lib/constants/scope';
import type {
  KnowledgeBaseSummary,
  KnowledgeFileSummary,
  KnowledgeSearchItem,
  PaginatedResponse,
} from '@/lib/server/kb/contracts';
import type { MemoryNoteSummary, MemorySearchItem } from '@/lib/server/memory/contracts';
import { cn } from '@/lib/utils';

type MemoryCategory = 'preference' | 'teaching_rule' | 'template' | 'fact' | 'summary' | 'general';
type ApiSuccess<T> = { success: true } & T;
type ApiFailure = { success: false; error: string; details?: string };

const memoryCategories: Array<{ value: MemoryCategory; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'preference', label: 'Preference' },
  { value: 'teaching_rule', label: 'Teaching Rule' },
  { value: 'template', label: 'Template' },
  { value: 'fact', label: 'Fact' },
  { value: 'summary', label: 'Summary' },
];

const kbTone: Record<KnowledgeBaseSummary['status'], 'default' | 'secondary' | 'outline'> = { active: 'default', archived: 'secondary', deleting: 'outline' };
const fileTone: Record<KnowledgeFileSummary['ingestStatus'], 'default' | 'secondary' | 'outline' | 'destructive'> = { indexed: 'default', processing: 'secondary', pending: 'secondary', skipped: 'outline', failed: 'destructive' };

async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (!response.ok || !data || data.success === false) throw new Error(data && 'error' in data ? data.error : `Request failed: ${response.status}`);
  return data as T;
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value);
}
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function formatDuration(durationMs?: number | null) {
  if (durationMs == null) return null;
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
function getAssetIcon(assetType: KnowledgeFileSummary['assetType']) {
  if (assetType === 'video') return Film;
  if (assetType === 'image') return ImageIcon;
  return FileText;
}

export function KnowledgeWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'knowledge' | 'memory'>('knowledge');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFileSummary[]>([]);
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('');
  const [knowledgeSearchResults, setKnowledgeSearchResults] = useState<KnowledgeSearchItem[]>([]);
  const [kbName, setKbName] = useState('');
  const [kbDescription, setKbDescription] = useState('');
  const [memoryNotes, setMemoryNotes] = useState<MemoryNoteSummary[]>([]);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [memorySearchResults, setMemorySearchResults] = useState<MemorySearchItem[]>([]);
  const [memoryContent, setMemoryContent] = useState('');
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>('general');
  const [memoryKeywords, setMemoryKeywords] = useState('');
  const [memoryTags, setMemoryTags] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingKbs, setLoadingKbs] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const selectedKb = useMemo(() => knowledgeBases.find((item) => item.id === selectedKbId) ?? null, [knowledgeBases, selectedKbId]);

  useEffect(() => { void loadKnowledgeBases(); void loadMemoryNotes(); }, []);
  useEffect(() => { if (selectedKbId) void loadKnowledgeFiles(selectedKbId); }, [selectedKbId]);

  async function loadKnowledgeBases() {
    setLoadingKbs(true);
    try {
      const result = await apiFetch<PaginatedResponse<KnowledgeBaseSummary>>(`/api/kb?scopeId=${encodeURIComponent(DEFAULT_SCOPE_ID)}&page=1&pageSize=100`);
      setKnowledgeBases(result.items);
      setSelectedKbId((current) => (current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load knowledge bases');
    } finally { setLoadingKbs(false); }
  }

  async function loadKnowledgeFiles(knowledgeBaseId: string) {
    setLoadingFiles(true);
    try {
      const result = await apiFetch<PaginatedResponse<KnowledgeFileSummary>>(`/api/kb/${encodeURIComponent(knowledgeBaseId)}/files?page=1&pageSize=100`);
      setKnowledgeFiles(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load knowledge files');
    } finally { setLoadingFiles(false); }
  }

  async function loadMemoryNotes() {
    setLoadingMemories(true);
    try {
      const result = await apiFetch<PaginatedResponse<MemoryNoteSummary>>(`/api/memory?scopeId=${encodeURIComponent(DEFAULT_SCOPE_ID)}&page=1&pageSize=100`);
      setMemoryNotes(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load memory notes');
    } finally { setLoadingMemories(false); }
  }

  async function createKnowledgeBase() {
    if (!kbName.trim()) return toast.error('Knowledge base name is required');
    setBusy('create-kb');
    try {
      const result = await apiFetch<{ knowledgeBase: KnowledgeBaseSummary }>('/api/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: kbName.trim(), description: kbDescription.trim() || undefined, scopeId: DEFAULT_SCOPE_ID }) });
      setKbName('');
      setKbDescription('');
      await loadKnowledgeBases();
      setSelectedKbId(result.knowledgeBase.id);
      toast.success(`Created knowledge base: ${result.knowledgeBase.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create knowledge base');
    } finally { setBusy(null); }
  }

  async function deleteKnowledgeBase(id: string) {
    setBusy(`delete-kb:${id}`);
    try {
      await apiFetch<{ id: string }>(`/api/kb/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setKnowledgeSearchResults([]);
      if (selectedKbId === id) setKnowledgeFiles([]);
      await loadKnowledgeBases();
      toast.success('Knowledge base deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete knowledge base');
    } finally { setBusy(null); }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !selectedKbId) return;
    setBusy('upload-files');
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.set('file', file);
        formData.set('autoIngest', 'true');
        await apiFetch<{ knowledgeFile: KnowledgeFileSummary }>(`/api/kb/${encodeURIComponent(selectedKbId)}/files`, { method: 'POST', body: formData });
      }
      await Promise.all([loadKnowledgeBases(), loadKnowledgeFiles(selectedKbId)]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload files');
    } finally { setBusy(null); }
  }

  async function deleteFile(fileId: string) {
    if (!selectedKbId) return;
    setBusy(`delete-file:${fileId}`);
    try {
      await apiFetch<{ id: string }>(`/api/kb/${encodeURIComponent(selectedKbId)}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      await Promise.all([loadKnowledgeBases(), loadKnowledgeFiles(selectedKbId)]);
      toast.success('File deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete file');
    } finally { setBusy(null); }
  }

  async function reindexFile(fileId: string) {
    if (!selectedKbId) return;
    setBusy(`reindex-file:${fileId}`);
    try {
      await apiFetch<{ jobId: string }>(`/api/kb/${encodeURIComponent(selectedKbId)}/files/${encodeURIComponent(fileId)}/reindex`, { method: 'POST' });
      await loadKnowledgeFiles(selectedKbId);
      toast.success('Reindex completed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reindex file');
    } finally { setBusy(null); }
  }
  async function searchKnowledge() {
    if (!selectedKbId || !knowledgeSearchQuery.trim()) return setKnowledgeSearchResults([]);
    setBusy('search-kb');
    try {
      const result = await apiFetch<{ items: KnowledgeSearchItem[] }>('/api/kb/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: knowledgeSearchQuery.trim(), knowledgeBaseIds: [selectedKbId], includeVideos: true, includeDocuments: true, topK: 8 }) });
      setKnowledgeSearchResults(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to search knowledge base');
    } finally { setBusy(null); }
  }

  async function createMemory() {
    if (!memoryContent.trim()) return toast.error('Memory content is required');
    setBusy('create-memory');
    try {
      await apiFetch<{ memoryNote: MemoryNoteSummary }>('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopeId: DEFAULT_SCOPE_ID, content: memoryContent.trim(), category: memoryCategory, keywords: memoryKeywords.split(',').map((item) => item.trim()).filter(Boolean), tags: memoryTags.split(',').map((item) => item.trim()).filter(Boolean), metadata: {} }) });
      setMemoryContent('');
      setMemoryKeywords('');
      setMemoryTags('');
      await loadMemoryNotes();
      toast.success('Memory saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create memory');
    } finally { setBusy(null); }
  }

  async function togglePinned(note: MemoryNoteSummary) {
    setBusy(`pin-memory:${note.id}`);
    try {
      await apiFetch<{ memoryNote: MemoryNoteSummary }>(`/api/memory/${encodeURIComponent(note.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPinned: !note.isPinned }) });
      await loadMemoryNotes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update memory');
    } finally { setBusy(null); }
  }

  async function deleteMemory(id: string) {
    setBusy(`delete-memory:${id}`);
    try {
      await apiFetch<{ id: string }>(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setMemorySearchResults((current) => current.filter((item) => item.id !== id));
      await loadMemoryNotes();
      toast.success('Memory deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete memory');
    } finally { setBusy(null); }
  }

  async function searchMemory() {
    if (!memorySearchQuery.trim()) return setMemorySearchResults([]);
    setBusy('search-memory');
    try {
      const result = await apiFetch<{ items: MemorySearchItem[] }>('/api/memory/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopeId: DEFAULT_SCOPE_ID, query: memorySearchQuery.trim(), categories: [], topK: 8 }) });
      setMemorySearchResults(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to search memory');
    } finally { setBusy(null); }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(241,245,249,0.9),_transparent_40%),linear-gradient(135deg,_#f8fafc_0%,_#eef2ff_40%,_#ecfeff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/70 bg-white/80 px-6 py-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"><ArrowLeft className="size-4" />Back to Home</Link>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-lg shadow-slate-900/15"><Database className="size-6" /></div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Knowledge Workspace</h1>
                  <p className="text-sm text-slate-600">Manage reusable documents, videos, and memory notes for PPT generation.</p>
                </div>
              </div>
            </div>
            <div className="grid min-w-[220px] grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard label="Knowledge Bases" value={knowledgeBases.length} icon={Database} />
              <MetricCard label="Indexed Files" value={knowledgeFiles.filter((item) => item.ingestStatus === 'indexed').length} icon={FileText} />
              <MetricCard label="Memory Notes" value={memoryNotes.length} icon={Brain} />
            </div>
          </div>
        </header>

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="gap-6">
          <TabsList variant="line" className="w-full justify-start rounded-2xl border border-white/70 bg-white/70 p-1 shadow-sm backdrop-blur">
            <TabsTrigger value="knowledge" className="max-w-[220px] flex-none"><Database className="size-4" />Knowledge Base</TabsTrigger>
            <TabsTrigger value="memory" className="max-w-[220px] flex-none"><Brain className="size-4" />Memory</TabsTrigger>
          </TabsList>

          <TabsContent value="knowledge" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <Card className="border-white/70 bg-white/85 shadow-sm">
                <CardHeader>
                  <CardTitle>Create Knowledge Base</CardTitle>
                  <CardDescription>Group documents, videos, and images by topic or customer.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="kb-name">Name</Label><Input id="kb-name" value={kbName} onChange={(event) => setKbName(event.target.value)} placeholder="Physics Experiment Videos" /></div>
                  <div className="space-y-2"><Label htmlFor="kb-description">Description</Label><Textarea id="kb-description" value={kbDescription} onChange={(event) => setKbDescription(event.target.value)} placeholder="Short description for retrieval and maintenance." className="min-h-24" /></div>
                </CardContent>
                <CardFooter className="border-t border-slate-200/80 pt-4"><Button onClick={createKnowledgeBase} disabled={busy === 'create-kb'} className="w-full">{busy === 'create-kb' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Create</Button></CardFooter>
              </Card>

              <Card className="border-white/70 bg-white/85 shadow-sm">
                <CardHeader className="border-b border-slate-200/80">
                  <div className="flex items-center justify-between gap-3">
                    <div><CardTitle>Knowledge Bases</CardTitle><CardDescription>Select one knowledge base to upload files and run search.</CardDescription></div>
                    <Button variant="outline" size="sm" onClick={() => void loadKnowledgeBases()} disabled={loadingKbs}>{loadingKbs ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}Refresh</Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 pt-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    {knowledgeBases.length === 0 ? <EmptyState icon={Database} title="No knowledge bases yet" description="Create one on the left to start importing videos, documents, and images." /> : knowledgeBases.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedKbId(item.id)} className={cn('w-full rounded-2xl border p-4 text-left transition', item.id === selectedKbId ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1"><div className="font-medium">{item.name}</div><div className={cn('text-xs', item.id === selectedKbId ? 'text-slate-200' : 'text-slate-500')}>{item.description || 'No description'}</div></div>
                          <Badge variant={kbTone[item.status]}>{item.status}</Badge>
                        </div>
                        <div className={cn('mt-3 flex flex-wrap gap-2 text-xs', item.id === selectedKbId ? 'text-slate-200' : 'text-slate-500')}><span>{item.fileCount} files</span><span>{formatDate(item.updatedAt)}</span></div>
                        <div className="mt-4 flex justify-end"><Button variant={item.id === selectedKbId ? 'secondary' : 'outline'} size="sm" onClick={(event) => { event.stopPropagation(); void deleteKnowledgeBase(item.id); }} disabled={busy === `delete-kb:${item.id}`}>{busy === `delete-kb:${item.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Delete</Button></div>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {!selectedKb ? <EmptyState icon={Upload} title="Select a knowledge base" description="After selecting one, upload files and test retrieval here." /> : (
                      <>
                        <Card className="border-slate-200 bg-slate-50 shadow-none">
                          <CardHeader><CardTitle>{selectedKb.name}</CardTitle><CardDescription>{selectedKb.description || 'No description'}</CardDescription></CardHeader>
                          <CardContent className="grid gap-3 sm:grid-cols-3"><MiniStat label="Files" value={selectedKb.fileCount} /><MiniStat label="Indexed" value={knowledgeFiles.filter((item) => item.ingestStatus === 'indexed').length} /><MiniStat label="Updated" value={formatDate(selectedKb.updatedAt)} /></CardContent>
                        </Card>
                        <Card className="border-slate-200 bg-slate-50 shadow-none">
                          <CardHeader><CardTitle>Upload Files</CardTitle><CardDescription>Video files will attempt to extract poster, duration, and resolution automatically.</CardDescription></CardHeader>
                          <CardContent className="space-y-3">
                            <input ref={fileInputRef} type="file" multiple onChange={(event) => void uploadFiles(event.target.files)} className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800" />
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-500">Supported now: text-like documents, PDF, DOCX, PPTX, XLSX, images, and videos. Semantic vector retrieval is still pending.</div>
                          </CardContent>
                          <CardFooter className="border-t border-slate-200/80 pt-4"><Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy === 'upload-files'}>{busy === 'upload-files' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Select Files</Button></CardFooter>
                        </Card>
                        <Card className="border-slate-200 bg-slate-50 shadow-none">
                          <CardHeader><CardTitle>Search</CardTitle><CardDescription>Inspect what retrieval currently returns for this knowledge base.</CardDescription></CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex gap-2"><Input value={knowledgeSearchQuery} onChange={(event) => setKnowledgeSearchQuery(event.target.value)} placeholder="Search by file name or indexed text" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchKnowledge(); } }} /><Button onClick={searchKnowledge} disabled={busy === 'search-kb'}>{busy === 'search-kb' ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Search</Button></div>
                            <div className="space-y-3">
                              {knowledgeSearchResults.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">No search results yet.</div> : knowledgeSearchResults.map((item) => item.type === 'video' ? (
                                <div key={item.fileId} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{item.filename}</div><div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><span>score {item.score.toFixed(2)}</span>{item.durationMs != null ? <span>{formatDuration(item.durationMs)}</span> : null}{item.width != null && item.height != null ? <span>{item.width} x {item.height}</span> : null}</div></div><Badge variant="secondary">video</Badge></div><div className="mt-3 flex gap-2"><Button asChild variant="outline" size="sm"><a href={item.url} target="_blank" rel="noreferrer">Open Video</a></Button>{item.posterUrl ? <Button asChild variant="ghost" size="sm"><a href={item.posterUrl} target="_blank" rel="noreferrer">Open Poster</a></Button> : null}</div></div>
                              ) : <div key={item.chunkId} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Badge variant="outline">text</Badge>{item.pageNo != null ? <span className="text-xs text-slate-500">page {item.pageNo}</span> : null}</div><span className="text-xs text-slate-500">score {item.score.toFixed(2)}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.text}</p></div>)}
                            </div>
                          </CardContent>
                        </Card>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-white/70 bg-white/85 shadow-sm">
              <CardHeader className="border-b border-slate-200/80">
                <div className="flex items-center justify-between gap-3">
                  <div><CardTitle>Files</CardTitle><CardDescription>Imported files for the selected knowledge base.</CardDescription></div>
                  {selectedKbId ? <Button variant="outline" size="sm" onClick={() => void loadKnowledgeFiles(selectedKbId)} disabled={loadingFiles}>{loadingFiles ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}Refresh Files</Button> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-6">
                {selectedKbId == null ? <EmptyState icon={Database} title="No knowledge base selected" description="Choose a knowledge base above to inspect its files." /> : knowledgeFiles.length === 0 ? <EmptyState icon={Upload} title="No files imported" description="Upload documents, videos, or images to make retrieval useful." /> : knowledgeFiles.map((file) => {
                  const AssetIcon = getAssetIcon(file.assetType);
                  return <div key={file.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><div className="rounded-2xl bg-white p-3 shadow-sm"><AssetIcon className="size-5 text-slate-700" /></div><div className="space-y-2"><div className="font-medium text-slate-900">{file.filename}</div><div className="flex flex-wrap gap-2 text-xs text-slate-500"><span>{formatFileSize(file.fileSize)}</span><span>{file.mimeType || file.assetType}</span><span>{formatDate(file.updatedAt)}</span>{file.durationMs != null ? <span>{formatDuration(file.durationMs)}</span> : null}{file.width != null && file.height != null ? <span>{file.width} x {file.height}</span> : null}</div><div className="flex flex-wrap gap-2"><Badge variant="outline">{file.assetType}</Badge><Badge variant={fileTone[file.ingestStatus]}>{file.ingestStatus}</Badge>{file.posterUrl ? <Badge variant="secondary">poster</Badge> : null}</div></div></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`/api/kb/files/${file.id}/content`} target="_blank" rel="noreferrer">Open</a></Button>{file.posterUrl ? <Button asChild variant="ghost" size="sm"><a href={file.posterUrl} target="_blank" rel="noreferrer">Poster</a></Button> : null}<Button variant="ghost" size="sm" onClick={() => void reindexFile(file.id)} disabled={busy === `reindex-file:${file.id}`}>{busy === `reindex-file:${file.id}` ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}Reindex</Button><Button variant="destructive" size="sm" onClick={() => void deleteFile(file.id)} disabled={busy === `delete-file:${file.id}`}>{busy === `delete-file:${file.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Delete</Button></div></div>;
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="memory" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card className="border-white/70 bg-white/85 shadow-sm">
                <CardHeader><CardTitle>Create Memory</CardTitle><CardDescription>Store durable preferences, facts, templates, and teaching rules.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="memory-category">Category</Label><Select value={memoryCategory} onValueChange={(value) => setMemoryCategory(value as MemoryCategory)}><SelectTrigger id="memory-category" className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{memoryCategories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="memory-content">Content</Label><Textarea id="memory-content" value={memoryContent} onChange={(event) => setMemoryContent(event.target.value)} className="min-h-32" placeholder="For Grade 8 science decks, keep examples concrete and use everyday classroom objects first." /></div>
                  <div className="space-y-2"><Label htmlFor="memory-keywords">Keywords</Label><Input id="memory-keywords" value={memoryKeywords} onChange={(event) => setMemoryKeywords(event.target.value)} placeholder="grade 8, science, examples" /></div>
                  <div className="space-y-2"><Label htmlFor="memory-tags">Tags</Label><Input id="memory-tags" value={memoryTags} onChange={(event) => setMemoryTags(event.target.value)} placeholder="teacher-style, reusable" /></div>
                </CardContent>
                <CardFooter className="border-t border-slate-200/80 pt-4"><Button onClick={createMemory} disabled={busy === 'create-memory'} className="w-full">{busy === 'create-memory' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Save Memory</Button></CardFooter>
              </Card>

              <Card className="border-white/70 bg-white/85 shadow-sm">
                <CardHeader className="border-b border-slate-200/80"><div className="flex items-center justify-between gap-3"><div><CardTitle>Memory Search</CardTitle><CardDescription>Inspect what the current memory retrieval returns for your query.</CardDescription></div><Button variant="outline" size="sm" onClick={() => void loadMemoryNotes()} disabled={loadingMemories}>{loadingMemories ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}Refresh</Button></div></CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex gap-2"><Input value={memorySearchQuery} onChange={(event) => setMemorySearchQuery(event.target.value)} placeholder="Search memory by intent or wording" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchMemory(); } }} /><Button onClick={searchMemory} disabled={busy === 'search-memory'}>{busy === 'search-memory' ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Search</Button></div>
                  <div className="space-y-3">{memorySearchResults.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">No memory search results yet.</div> : memorySearchResults.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Badge variant="secondary">{item.category}</Badge>{item.isPinned ? <Badge>pinned</Badge> : null}</div><span className="text-xs text-slate-500">score {item.score.toFixed(2)}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p></div>)}</div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-white/70 bg-white/85 shadow-sm">
              <CardHeader className="border-b border-slate-200/80"><CardTitle>Memory Notes</CardTitle><CardDescription>Pin the notes that should have higher retrieval priority during generation.</CardDescription></CardHeader>
              <CardContent className="space-y-3 pt-6">{memoryNotes.length === 0 ? <EmptyState icon={Brain} title="No memory notes yet" description="Create the first one above. Then generation can reuse it as stable preference or fact." /> : memoryNotes.map((note) => <div key={note.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-start lg:justify-between"><div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{note.category}</Badge>{note.isPinned ? <Badge>pinned</Badge> : null}{note.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.content}</p><div className="flex flex-wrap gap-2 text-xs text-slate-500">{note.keywords.map((keyword) => <span key={keyword}>#{keyword}</span>)}</div><div className="text-xs text-slate-500">Updated {formatDate(note.updatedAt)}</div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void togglePinned(note)} disabled={busy === `pin-memory:${note.id}`}>{busy === `pin-memory:${note.id}` ? <Loader2 className="size-4 animate-spin" /> : note.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{note.isPinned ? 'Unpin' : 'Pin'}</Button><Button variant="destructive" size="sm" onClick={() => void deleteMemory(note.id)} disabled={busy === `delete-memory:${note.id}`}>{busy === `delete-memory:${note.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Delete</Button></div></div>)}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Database }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</span><Icon className="size-4 text-slate-500" /></div><div className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</div></div>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-3"><div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-2 text-sm font-medium text-slate-900">{value}</div></div>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Database; title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm"><Icon className="size-5 text-slate-500" /></div><div className="mt-4 text-base font-medium text-slate-900">{title}</div><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></div>;
}
