import { createHash } from 'crypto';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { Scene, Stage } from '@/lib/types/stage';
import type { ClassroomDifyMetadata } from '@/lib/server/publish/classroom-publish-store';

const SEGMENT_SEPARATOR = '\n\n<<<OPENMAIC_SEGMENT>>>\n\n';
const MAX_SEGMENT_LENGTH = 4000;
const CHUNK_SUFFIX_RESERVE = 80;

export interface ClassroomDifySegment {
  sceneId: string;
  sceneOrder: number;
  sceneTitle: string;
  chunkIndex: number;
  text: string;
}

export interface ClassroomDifySerializedContent {
  metadata: ClassroomDifyMetadata;
  documentText: string;
  contentHash: string;
  segments: ClassroomDifySegment[];
  separator: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function pushText(parts: string[], value: unknown) {
  if (typeof value !== 'string') return;
  const normalized = normalizeWhitespace(value);
  if (normalized) {
    parts.push(normalized);
  }
}

function extractSlideText(scene: Scene): string[] {
  if (scene.content.type !== 'slide') return [];

  const parts: string[] = [];
  for (const element of scene.content.canvas.elements as unknown as Array<Record<string, unknown>>) {
    pushText(parts, element['content']);
    pushText(parts, element['text']);
    pushText(parts, element['latex']);
    pushText(parts, element['title']);
    pushText(parts, element['description']);

    if (Array.isArray(element['labels'])) {
      for (const label of element['labels']) {
        pushText(parts, label);
      }
    }
  }

  return parts;
}

function extractQuizText(scene: Scene): string[] {
  if (scene.content.type !== 'quiz') return [];

  const parts: string[] = [];
  for (const [index, question] of scene.content.questions.entries()) {
    parts.push(`Question ${index + 1}: ${question.question}`);
    for (const option of question.options || []) {
      parts.push(`${option.value}. ${option.label}`);
    }
    if (question.analysis) {
      parts.push(`Analysis: ${question.analysis}`);
    }
  }
  return parts;
}

function extractInteractiveText(scene: Scene): string[] {
  if (scene.content.type !== 'interactive') return [];

  const parts: string[] = [];
  pushText(parts, scene.content.url);
  if (scene.content.html) {
    pushText(parts, stripHtml(scene.content.html));
  }
  return parts;
}

function extractPblText(scene: Scene): string[] {
  if (scene.content.type !== 'pbl') return [];

  const payload = scene.content.projectConfig as unknown as Record<string, unknown>;
  const parts: string[] = [];
  const projectInfo = payload['projectInfo'] as Record<string, unknown> | undefined;

  if (projectInfo) {
    pushText(parts, projectInfo['title']);
    pushText(parts, projectInfo['description']);
    pushText(parts, projectInfo['drivingQuestion']);
  }

  const issues = payload['issues'];
  if (Array.isArray(issues)) {
    for (const issue of issues as Array<Record<string, unknown>>) {
      pushText(parts, issue['title']);
      pushText(parts, issue['description']);
      pushText(parts, issue['notes']);
    }
  }

  return parts;
}

function extractActionText(actions: Action[] | undefined): string[] {
  if (!actions?.length) return [];

  const parts: string[] = [];
  for (const action of actions) {
    if (action.type === 'speech') {
      pushText(parts, (action as SpeechAction).text);
    }
  }

  return parts;
}

function splitSegmentText(baseText: string, maxLength: number): string[] {
  const normalized = normalizeWhitespace(baseText);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const paragraphs = normalized.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const value = normalizeWhitespace(current);
    if (value) chunks.push(value);
    current = '';
  };

  const append = (text: string) => {
    const candidate = current ? `${current}\n\n${text}` : text;
    if (candidate.length <= maxLength) {
      current = candidate;
      return;
    }

    if (!current) {
      let remaining = text;
      while (remaining.length > maxLength) {
        chunks.push(remaining.slice(0, maxLength));
        remaining = remaining.slice(maxLength);
      }
      current = remaining;
      return;
    }

    flush();
    append(text);
  };

  for (const paragraph of paragraphs) {
    append(paragraph);
  }
  flush();

  return chunks;
}

function buildSceneBody(scene: Scene, pageNumber: number): string {
  const sections: string[] = [
    `Page ${pageNumber}`,
    `Title: ${scene.title || `Untitled Scene ${pageNumber}`}`,
    `Type: ${scene.type}`,
  ];

  const contentParts = [
    ...extractSlideText(scene),
    ...extractQuizText(scene),
    ...extractInteractiveText(scene),
    ...extractPblText(scene),
  ];
  if (contentParts.length > 0) {
    sections.push(`Content:\n${contentParts.join('\n')}`);
  }

  const actionParts = extractActionText(scene.actions);
  if (actionParts.length > 0) {
    sections.push(`Narration:\n${actionParts.join('\n')}`);
  }

  const retrievalContext = scene.generationContext?.retrievalContext?.trim();
  if (retrievalContext) {
    sections.push(`Retrieval Context:\n${retrievalContext}`);
  }

  const references = scene.generationContext?.knowledgeVideoReferences || [];
  if (references.length > 0) {
    sections.push(
      `References:\n${references.map((item) => `- ${item.filename}${item.src ? ` (${item.src})` : ''}`).join('\n')}`,
    );
  }

  return sections.join('\n\n');
}

function buildMetadata(stage: Stage, classroomId: string): ClassroomDifyMetadata {
  return {
    classroom: classroomId,
    type: stage.generationContext?.classroomType || 'course',
    title: stage.name || classroomId,
  };
}

export function serializeClassroomForDify(input: {
  classroomId: string;
  stage: Stage;
  scenes: Scene[];
}): ClassroomDifySerializedContent {
  const metadata = buildMetadata(input.stage, input.classroomId);
  const sortedScenes = [...input.scenes].sort((a, b) => a.order - b.order);
  const segments: ClassroomDifySegment[] = [];

  for (const [sceneIndex, scene] of sortedScenes.entries()) {
    const baseText = [
      `classroom: ${metadata.classroom}`,
      `type: ${metadata.type}`,
      `title: ${metadata.title}`,
      buildSceneBody(scene, sceneIndex + 1),
    ].join('\n\n');

    const chunks = splitSegmentText(baseText, MAX_SEGMENT_LENGTH - CHUNK_SUFFIX_RESERVE);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      segments.push({
        sceneId: scene.id,
        sceneOrder: scene.order,
        sceneTitle: scene.title,
        chunkIndex,
        text:
          chunks.length > 1
            ? `${chunk}\n\nSegment: Page ${sceneIndex + 1} / Part ${chunkIndex + 1}`
            : chunk,
      });
    }
  }

  const documentText = segments.map((segment) => segment.text).join(SEGMENT_SEPARATOR);
  const contentHash = createHash('sha256').update(documentText).digest('hex');

  return {
    metadata,
    documentText,
    contentHash,
    segments,
    separator: SEGMENT_SEPARATOR,
  };
}
