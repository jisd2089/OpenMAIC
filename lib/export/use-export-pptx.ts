'use client';

import { useState, useCallback, useRef } from 'react';
import pptxgen from 'pptxgenjs';
import tinycolor from 'tinycolor2';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

import { useStageStore } from '@/lib/store';
import { useCanvasStore } from '@/lib/store/canvas';
import { useMediaGenerationStore, isMediaPlaceholder } from '@/lib/store/media-generation';
import { resolveKnowledgeMediaPoster, resolveKnowledgeMediaSrc } from '@/lib/kb/reference';
import {
  buildGenerationContextExport,
  buildGenerationContextText,
  buildPresentationSubject,
} from '@/lib/export/context-export';
import { useI18n } from '@/lib/hooks/use-i18n';
import type {
  Slide,
  PPTElementOutline,
  PPTElementShadow,
  PPTTextElement,
  PPTElementLink,
} from '@/lib/types/slides';
import type { Scene, SlideContent, Stage } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import { getElementRange, getLineElementPath, getTableSubThemeColor } from '@/lib/utils/element';
import { type AST, toAST } from '@/lib/export/html-parser';
import { type SvgPoints, toPoints, getSvgPathRange } from '@/lib/export/svg-path-parser';
import { svg2Base64 } from '@/lib/export/svg2base64';
import { latexToOmml } from '@/lib/export/latex-to-omml';
import { createLogger } from '@/lib/logger';

const log = createLogger('ExportPPTX');

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_FAMILY = 'Microsoft YaHei';
const MAX_SCENE_RETRIEVAL_NOTES_CHARS = 1200;
const TEXT_ELEMENT_PADDING_PX = 10;
const TEXT_COLLISION_GAP_PX = 12;
const LEGACY_UNORDERED_BULLET_RE = /^[\u2022\u2023\u25E6\u2043\u2219]\s*/;
const LEGACY_ORDERED_BULLET_RE = /^(\d+)[.)]\s+/;

// ── Color formatting ──

function formatColor(_color: string) {
  if (!_color) {
    return { alpha: 0, color: '#000000' };
  }
  const c = tinycolor(_color);
  const alpha = c.getAlpha();
  const color = alpha === 0 ? '#ffffff' : c.setAlpha(1).toHexString();
  return { alpha, color };
}

type FormatColor = ReturnType<typeof formatColor>;

// ── HTML → pptxgenjs TextProps ──

function formatHTML(html: string, ratioPx2Pt: number) {
  const ast = toAST(html);
  let bulletFlag = false;
  let indent = 0;

  const slices: pptxgen.TextProps[] = [];

  const parse = (obj: AST[], baseStyleObj: Record<string, string> = {}) => {
    for (const item of obj) {
      const isBlockTag = 'tagName' in item && ['div', 'li', 'p'].includes(item.tagName);

      if (isBlockTag && slices.length) {
        const lastSlice = slices[slices.length - 1];
        if (!lastSlice.options) lastSlice.options = {};
        lastSlice.options.breakLine = true;
      }

      const styleObj = { ...baseStyleObj };
      const styleAttr =
        'attributes' in item ? item.attributes.find((attr) => attr.key === 'style') : null;
      if (styleAttr && styleAttr.value) {
        const styleArr = styleAttr.value.split(';');
        for (const styleItem of styleArr) {
          const match = styleItem.match(/([^:]+):\s*(.+)/);
          if (match) {
            const [key, value] = [match[1].trim(), match[2].trim()];
            if (key && value) styleObj[key] = value;
          }
        }
      }

      if ('tagName' in item) {
        if (item.tagName === 'em') styleObj['font-style'] = 'italic';
        if (item.tagName === 'strong') styleObj['font-weight'] = 'bold';
        if (item.tagName === 'sup') styleObj['vertical-align'] = 'super';
        if (item.tagName === 'sub') styleObj['vertical-align'] = 'sub';
        if (item.tagName === 'a') {
          const attr = item.attributes.find((a) => a.key === 'href');
          styleObj['href'] = attr?.value || '';
        }
        if (item.tagName === 'ul') styleObj['list-type'] = 'ul';
        if (item.tagName === 'ol') styleObj['list-type'] = 'ol';
        if (item.tagName === 'li') bulletFlag = true;
        if (item.tagName === 'p') {
          if ('attributes' in item) {
            const dataIndentAttr = item.attributes.find((a) => a.key === 'data-indent');
            if (dataIndentAttr && dataIndentAttr.value) indent = +dataIndentAttr.value;
          }
        }
      }

      if ('tagName' in item && item.tagName === 'br') {
        slices.push({ text: '', options: { breakLine: true } });
      } else if ('content' in item) {
        let text = item.content
          .replace(/&nbsp;/g, ' ')
          .replace(/&gt;/g, '>')
          .replace(/&lt;/g, '<')
          .replace(/&amp;/g, '&')
          .replace(/\n/g, '');
        const options: pptxgen.TextPropsOptions = {};

        if (styleObj['font-size']) {
          options.fontSize = parseInt(styleObj['font-size']) / ratioPx2Pt;
        }
        if (styleObj['color']) {
          options.color = formatColor(styleObj['color']).color;
        }
        if (styleObj['background-color']) {
          options.highlight = formatColor(styleObj['background-color']).color;
        }
        if (styleObj['text-decoration-line']) {
          if (styleObj['text-decoration-line'].indexOf('underline') !== -1) {
            options.underline = {
              color: options.color || '#000000',
              style: 'sng',
            };
          }
          if (styleObj['text-decoration-line'].indexOf('line-through') !== -1) {
            options.strike = 'sngStrike';
          }
        }
        if (styleObj['text-decoration']) {
          if (styleObj['text-decoration'].indexOf('underline') !== -1) {
            options.underline = {
              color: options.color || '#000000',
              style: 'sng',
            };
          }
          if (styleObj['text-decoration'].indexOf('line-through') !== -1) {
            options.strike = 'sngStrike';
          }
        }
        if (styleObj['vertical-align']) {
          if (styleObj['vertical-align'] === 'super') options.superscript = true;
          if (styleObj['vertical-align'] === 'sub') options.subscript = true;
        }
        if (styleObj['text-align']) options.align = styleObj['text-align'] as pptxgen.HAlign;
        if (styleObj['font-weight']) options.bold = styleObj['font-weight'] === 'bold';
        if (styleObj['font-style']) options.italic = styleObj['font-style'] === 'italic';
        if (styleObj['font-family']) options.fontFace = styleObj['font-family'];
        if (styleObj['href']) options.hyperlink = { url: styleObj['href'] };

        const orderedBulletMatch = text.match(LEGACY_ORDERED_BULLET_RE);
        const hasLegacyUnorderedBullet = LEGACY_UNORDERED_BULLET_RE.test(text);
        if (!bulletFlag && orderedBulletMatch) {
          text = text.replace(LEGACY_ORDERED_BULLET_RE, '');
          options.bullet = {
            type: 'number',
            indent: (options.fontSize || DEFAULT_FONT_SIZE) * 1.25,
          };
          options.paraSpaceBefore = 0.1;
        } else if (!bulletFlag && hasLegacyUnorderedBullet) {
          text = text.replace(LEGACY_UNORDERED_BULLET_RE, '');
          options.bullet = {
            indent: (options.fontSize || DEFAULT_FONT_SIZE) * 1.25,
          };
          options.paraSpaceBefore = 0.1;
        }

        if (bulletFlag && styleObj['list-type'] === 'ol') {
          options.bullet = {
            type: 'number',
            indent: (options.fontSize || DEFAULT_FONT_SIZE) * 1.25,
          };
          options.paraSpaceBefore = 0.1;
          bulletFlag = false;
        }
        if (bulletFlag && styleObj['list-type'] === 'ul') {
          options.bullet = {
            indent: (options.fontSize || DEFAULT_FONT_SIZE) * 1.25,
          };
          options.paraSpaceBefore = 0.1;
          bulletFlag = false;
        }
        if (indent) {
          options.indentLevel = indent;
          indent = 0;
        }

        slices.push({ text, options });
      } else if ('children' in item) parse(item.children, styleObj);
    }
  };
  parse(ast);
  return slices;
}

function measureTextElementHeightPx(element: PPTTextElement): number {
  if (typeof document === 'undefined' || element.vertical) {
    return element.height;
  }

  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.left = '-100000px';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.boxSizing = 'border-box';
  probe.style.width = `${element.width}px`;
  probe.style.padding = `${TEXT_ELEMENT_PADDING_PX}px`;
  probe.style.lineHeight = `${element.lineHeight ?? 1.5}`;
  probe.style.letterSpacing = `${element.wordSpace || 0}px`;
  probe.style.fontFamily = element.defaultFontName || DEFAULT_FONT_FAMILY;
  probe.style.fontSize = `${DEFAULT_FONT_SIZE}px`;
  probe.style.color = element.defaultColor || '#000000';
  probe.style.whiteSpace = 'normal';
  probe.style.wordBreak = 'break-word';
  probe.style.overflowWrap = 'break-word';
  probe.innerHTML = `
    <style>
      .pptx-export-probe p { margin: 0 0 ${element.paragraphSpace === undefined ? 5 : element.paragraphSpace}px 0; }
      .pptx-export-probe ul, .pptx-export-probe ol { margin: 0 0 ${element.paragraphSpace === undefined ? 5 : element.paragraphSpace}px 0; padding-left: 1.5em; }
      .pptx-export-probe li { margin: 0; }
    </style>
    <div class="pptx-export-probe">${element.content}</div>
  `;

  document.body.appendChild(probe);
  const measuredHeight = Math.ceil(probe.getBoundingClientRect().height);
  document.body.removeChild(probe);
  return Math.max(element.height, measuredHeight);
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.max(startA, startB) < Math.min(endA, endB);
}

function getTextElementExportHeightPx(input: {
  element: PPTTextElement;
  slide: Slide;
  measuredHeightPx: number;
  topPx: number;
  viewportHeightPx: number;
}): number {
  const { element, slide, measuredHeightPx, topPx, viewportHeightPx } = input;
  const pageBottomLimit = Math.max(20, viewportHeightPx - topPx);
  const elementLeft = element.left;
  const elementRight = element.left + element.width;

  let collisionLimit = pageBottomLimit;
  for (const candidate of slide.elements || []) {
    if (candidate.id === element.id) continue;
    if (candidate.top <= topPx) continue;

    const candidateLeft = candidate.left;
    const candidateRight = candidate.left + candidate.width;
    if (!rangesOverlap(elementLeft, elementRight, candidateLeft, candidateRight)) continue;

    const availableHeight = candidate.top - topPx - TEXT_COLLISION_GAP_PX;
    if (availableHeight > 0) {
      collisionLimit = Math.min(collisionLimit, availableHeight);
    }
  }

  return Math.max(20, Math.min(Math.max(element.height, measuredHeightPx), collisionLimit));
}

type TextExportLayout = {
  topPx: number;
  heightPx: number;
  measuredHeightPx: number;
};

type TextExportSegment = {
  topPx: number;
  heightPx: number;
};

type TextExportBox = {
  topPx: number;
  heightPx: number;
  content: string;
  measuredHeightPx: number;
};

function buildTextExportLayoutMap(slide: Slide, viewportHeightPx: number): Map<string, TextExportLayout> {
  const layoutMap = new Map<string, TextExportLayout>();
  const textElements = (slide.elements || [])
    .filter((element): element is PPTTextElement => element.type === 'text')
    .sort((left, right) => left.top - right.top || left.left - right.left);

  for (const element of textElements) {
    const measuredHeightPx = measureTextElementHeightPx(element);
    let topPx = element.top;

    for (const [otherId, otherLayout] of layoutMap.entries()) {
      const other = textElements.find((candidate) => candidate.id === otherId);
      if (!other) continue;
      if (!rangesOverlap(element.left, element.left + element.width, other.left, other.left + other.width)) {
        continue;
      }

      const otherBottom = otherLayout.topPx + otherLayout.heightPx;
      if (otherBottom + TEXT_COLLISION_GAP_PX > topPx) {
        topPx = otherBottom + TEXT_COLLISION_GAP_PX;
      }
    }

    const heightPx = getTextElementExportHeightPx({
      element,
      slide,
      measuredHeightPx,
      topPx,
      viewportHeightPx,
    });

    layoutMap.set(element.id, {
      topPx,
      heightPx,
      measuredHeightPx,
    });
  }

  return layoutMap;
}

function measureTextHtmlHeightPx(element: PPTTextElement, html: string): number {
  return measureTextElementHeightPx({
    ...element,
    content: html,
  });
}

function splitTextContentIntoBlocks(html: string): string[] {
  if (typeof DOMParser === 'undefined') return [html];

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return [html];

  const blocks: string[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push(`<p>${text}</p>`);
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;

    if (node.tagName === 'UL' || node.tagName === 'OL') {
      const tagName = node.tagName.toLowerCase();
      const items = Array.from(node.children).filter(
        (child): child is HTMLLIElement => child instanceof HTMLLIElement,
      );
      if (items.length === 0) {
        blocks.push(node.outerHTML);
        continue;
      }
      for (const item of items) {
        blocks.push(`<${tagName}>${item.outerHTML}</${tagName}>`);
      }
      continue;
    }

    blocks.push(node.outerHTML);
  }

  return blocks.length > 0 ? blocks : [html];
}

function buildTextExportSegments(input: {
  element: PPTTextElement;
  slide: Slide;
  textExportLayoutMap: Map<string, TextExportLayout>;
  viewportHeightPx: number;
}): TextExportSegment[] {
  const { element, slide, textExportLayoutMap, viewportHeightPx } = input;
  const currentLayout = textExportLayoutMap.get(element.id) ?? {
    topPx: element.top,
    heightPx: element.height,
    measuredHeightPx: element.height,
  };

  const elementLeft = element.left;
  const elementRight = element.left + element.width;
  const obstacles = (slide.elements || [])
    .filter((candidate) => candidate.id !== element.id)
    .filter((candidate) =>
      rangesOverlap(elementLeft, elementRight, candidate.left, candidate.left + candidate.width),
    )
    .map((candidate) => {
      if (candidate.type === 'text') {
        const layout = textExportLayoutMap.get(candidate.id);
        if (layout) {
          return {
            topPx: layout.topPx,
            bottomPx: layout.topPx + layout.heightPx,
          };
        }
      }
      return {
        topPx: candidate.top,
        bottomPx: candidate.top + ('height' in candidate ? candidate.height : 0),
      };
    })
    .filter((candidate) => candidate.bottomPx > currentLayout.topPx)
    .sort((left, right) => left.topPx - right.topPx);

  const segments: TextExportSegment[] = [];
  let cursorTop = currentLayout.topPx;
  for (const obstacle of obstacles) {
    if (obstacle.bottomPx <= cursorTop) continue;

    const availableHeight = obstacle.topPx - cursorTop - TEXT_COLLISION_GAP_PX;
    if (availableHeight > 20) {
      segments.push({
        topPx: cursorTop,
        heightPx: availableHeight,
      });
    }
    cursorTop = Math.max(cursorTop, obstacle.bottomPx + TEXT_COLLISION_GAP_PX);
    if (cursorTop >= viewportHeightPx - 20) break;
  }

  if (cursorTop < viewportHeightPx - 20) {
    segments.push({
      topPx: cursorTop,
      heightPx: viewportHeightPx - cursorTop,
    });
  }

  return segments.length > 0
    ? segments
    : [
        {
          topPx: currentLayout.topPx,
          heightPx: Math.max(20, viewportHeightPx - currentLayout.topPx),
        },
      ];
}

function buildTextExportBoxes(input: {
  element: PPTTextElement;
  slide: Slide;
  textExportLayoutMap: Map<string, TextExportLayout>;
  viewportHeightPx: number;
}): TextExportBox[] {
  const { element, slide, textExportLayoutMap, viewportHeightPx } = input;
  const baseLayout = textExportLayoutMap.get(element.id) ?? {
    topPx: element.top,
    heightPx: element.height,
    measuredHeightPx: element.height,
  };

  if (baseLayout.measuredHeightPx <= baseLayout.heightPx) {
    return [
      {
        topPx: baseLayout.topPx,
        heightPx: baseLayout.heightPx,
        content: element.content,
        measuredHeightPx: baseLayout.measuredHeightPx,
      },
    ];
  }

  const segments = buildTextExportSegments({
    element,
    slide,
    textExportLayoutMap,
    viewportHeightPx,
  });
  const blocks = splitTextContentIntoBlocks(element.content);
  if (blocks.length <= 1) {
    return [
      {
        topPx: baseLayout.topPx,
        heightPx: baseLayout.heightPx,
        content: element.content,
        measuredHeightPx: baseLayout.measuredHeightPx,
      },
    ];
  }

  const boxes: TextExportBox[] = [];
  let blockIndex = 0;
  for (const segment of segments) {
    if (blockIndex >= blocks.length) break;

    const chunkBlocks: string[] = [];
    let chunkHtml = '';
    while (blockIndex < blocks.length) {
      const nextBlocks = [...chunkBlocks, blocks[blockIndex]];
      const nextHtml = nextBlocks.join('');
      const nextHeight = measureTextHtmlHeightPx(element, nextHtml);
      if (nextHeight <= segment.heightPx || chunkBlocks.length === 0) {
        chunkBlocks.push(blocks[blockIndex]);
        chunkHtml = nextHtml;
        blockIndex += 1;
        if (nextHeight > segment.heightPx) break;
        continue;
      }
      break;
    }

    if (!chunkHtml) continue;
    boxes.push({
      topPx: segment.topPx,
      heightPx: segment.heightPx,
      content: chunkHtml,
      measuredHeightPx: measureTextHtmlHeightPx(element, chunkHtml),
    });
  }

  if (boxes.length === 0) {
    return [
      {
        topPx: baseLayout.topPx,
        heightPx: baseLayout.heightPx,
        content: element.content,
        measuredHeightPx: baseLayout.measuredHeightPx,
      },
    ];
  }

  if (blockIndex < blocks.length) {
    const lastBox = boxes[boxes.length - 1];
    lastBox.content += blocks.slice(blockIndex).join('');
    lastBox.measuredHeightPx = measureTextHtmlHeightPx(element, lastBox.content);
  }

  return boxes;
}

// ── SVG path → pptxgenjs points ──

type Points = Array<
  | { x: number; y: number; moveTo?: boolean }
  | {
      x: number;
      y: number;
      curve: {
        type: 'arc';
        hR: number;
        wR: number;
        stAng: number;
        swAng: number;
      };
    }
  | {
      x: number;
      y: number;
      curve: { type: 'quadratic'; x1: number; y1: number };
    }
  | {
      x: number;
      y: number;
      curve: { type: 'cubic'; x1: number; y1: number; x2: number; y2: number };
    }
  | { close: true }
>;

function formatPoints(points: SvgPoints, ratioPx2Inch: number, scale = { x: 1, y: 1 }): Points {
  return points.map((point) => {
    if (point.close !== undefined) {
      return { close: true };
    } else if (point.type === 'M') {
      return {
        x: ((point.x as number) / ratioPx2Inch) * scale.x,
        y: ((point.y as number) / ratioPx2Inch) * scale.y,
        moveTo: true,
      };
    } else if (point.curve) {
      if (point.curve.type === 'cubic') {
        return {
          x: ((point.x as number) / ratioPx2Inch) * scale.x,
          y: ((point.y as number) / ratioPx2Inch) * scale.y,
          curve: {
            type: 'cubic' as const,
            x1: ((point.curve.x1 as number) / ratioPx2Inch) * scale.x,
            y1: ((point.curve.y1 as number) / ratioPx2Inch) * scale.y,
            x2: ((point.curve.x2 as number) / ratioPx2Inch) * scale.x,
            y2: ((point.curve.y2 as number) / ratioPx2Inch) * scale.y,
          },
        };
      } else if (point.curve.type === 'quadratic') {
        return {
          x: ((point.x as number) / ratioPx2Inch) * scale.x,
          y: ((point.y as number) / ratioPx2Inch) * scale.y,
          curve: {
            type: 'quadratic' as const,
            x1: ((point.curve.x1 as number) / ratioPx2Inch) * scale.x,
            y1: ((point.curve.y1 as number) / ratioPx2Inch) * scale.y,
          },
        };
      }
    }
    return {
      x: ((point.x as number) / ratioPx2Inch) * scale.x,
      y: ((point.y as number) / ratioPx2Inch) * scale.y,
    };
  });
}

// ── Shadow config ──

function getShadowOption(shadow: PPTElementShadow, ratioPx2Pt: number): pptxgen.ShadowProps {
  const c = formatColor(shadow.color);
  const { h, v } = shadow;

  let offset = 4;
  let angle = 45;

  if (h === 0 && v === 0) {
    offset = 4;
    angle = 45;
  } else if (h === 0) {
    if (v > 0) {
      offset = v;
      angle = 90;
    } else {
      offset = -v;
      angle = 270;
    }
  } else if (v === 0) {
    if (h > 0) {
      offset = h;
      angle = 1;
    } else {
      offset = -h;
      angle = 180;
    }
  } else if (h > 0 && v > 0) {
    offset = Math.max(h, v);
    angle = 45;
  } else if (h > 0 && v < 0) {
    offset = Math.max(h, -v);
    angle = 315;
  } else if (h < 0 && v > 0) {
    offset = Math.max(-h, v);
    angle = 135;
  } else if (h < 0 && v < 0) {
    offset = Math.max(-h, -v);
    angle = 225;
  }

  return {
    type: 'outer',
    color: c.color.replace('#', ''),
    opacity: c.alpha,
    blur: shadow.blur / ratioPx2Pt,
    offset,
    angle,
  };
}

// ── Outline config ──

const dashTypeMap: Record<string, string> = {
  solid: 'solid',
  dashed: 'dash',
  dotted: 'sysDot',
};

function getOutlineOption(outline: PPTElementOutline, ratioPx2Pt: number): pptxgen.ShapeLineProps {
  const c = formatColor(outline?.color || '#000000');
  return {
    color: c.color,
    transparency: (1 - c.alpha) * 100,
    width: (outline.width || 1) / ratioPx2Pt,
    dashType: outline.style ? (dashTypeMap[outline.style] as 'solid' | 'dash' | 'sysDot') : 'solid',
  };
}

// ── Link config ──

function getLinkOption(link: PPTElementLink, slides: Slide[]): pptxgen.HyperlinkProps | null {
  const { type, target } = link;
  if (type === 'web') return { url: target };
  if (type === 'slide') {
    const index = slides.findIndex((slide) => slide.id === target);
    if (index !== -1) return { slide: index + 1 };
  }
  return null;
}

// ── Image helpers ──

function isBase64Image(url: string) {
  return /^data:image\/[^;]+;base64,/.test(url);
}

function isSVGImage(url: string) {
  return /^data:image\/svg\+xml;base64,/.test(url) || /\.svg$/.test(url);
}

// ── Main export hook ──

// ── Build PPTX blob (reused by single-export and resource pack) ──

/**
 * Extract speaker notes text from a scene's actions.
 * Concatenates speech text and action labels into plain text.
 */
function buildSpeakerNotes(scene: Scene): string {
  if (!scene.actions || scene.actions.length === 0) return '';

  const parts: string[] = [];
  for (const action of scene.actions) {
    if (action.type === 'speech') {
      parts.push((action as SpeechAction).text);
    }
  }
  return parts.join('\n');
}

function buildSceneGenerationNotes(scene: Scene): string {
  if (!scene.generationContext) return '';

  const parts: string[] = [];
  const retrievalContext = scene.generationContext.retrievalContext?.trim();
  if (retrievalContext) {
    const normalized =
      retrievalContext.length > MAX_SCENE_RETRIEVAL_NOTES_CHARS
        ? `${retrievalContext.slice(0, MAX_SCENE_RETRIEVAL_NOTES_CHARS).trim()}...`
        : retrievalContext;
    parts.push(`Retrieved Context\n${normalized}`);
  }

  if (scene.generationContext.knowledgeVideoReferences?.length) {
    parts.push(
      `Knowledge Video Candidates\n${scene.generationContext.knowledgeVideoReferences
        .map((item) => `- ${item.filename}`)
        .join('\n')}`,
    );
  }

  return parts.join('\n\n');
}

export async function buildPptxBlob(
  stage: Stage | null,
  slides: Slide[],
  slideScenes: Scene[],
  viewportRatio: number,
  viewportSize: number,
  ratioPx2Inch: number,
  ratioPx2Pt: number,
): Promise<Blob> {
  const pptx = new pptxgen();
  const generationContextText = buildGenerationContextText(stage);

  pptx.author = 'OpenMAIC';
  pptx.company = 'OpenMAIC';
  pptx.title = stage?.name || 'OpenMAIC Presentation';
  pptx.subject = buildPresentationSubject(stage);

  // Set layout based on aspect ratio
  if (viewportRatio === 0.625) pptx.layout = 'LAYOUT_16x10';
  else if (viewportRatio === 0.75) pptx.layout = 'LAYOUT_4x3';
  else pptx.layout = 'LAYOUT_16x9';

  for (let slideIdx = 0; slideIdx < slides.length; slideIdx++) {
    const slide = slides[slideIdx];
    const pptxSlide = pptx.addSlide();
    const textExportLayoutMap = buildTextExportLayoutMap(slide, viewportSize * viewportRatio);

      // ── Speaker Notes ──
      const scene = slideScenes[slideIdx];
      if (scene) {
        const notes = [buildSceneGenerationNotes(scene), buildSpeakerNotes(scene)]
          .filter(Boolean)
          .join('\n\n');
        const contextualNotes =
          slideIdx === 0 && generationContextText
            ? [generationContextText, notes].filter(Boolean).join('\n\n')
            : notes;
        if (contextualNotes) pptxSlide.addNotes(contextualNotes);
      }

    // ── Background ──
    if (slide.background) {
      const bg = slide.background;
      if (bg.type === 'image' && bg.image) {
        if (isSVGImage(bg.image.src)) {
          pptxSlide.addImage({
            data: bg.image.src,
            x: 0,
            y: 0,
            w: viewportSize / ratioPx2Inch,
            h: (viewportSize * viewportRatio) / ratioPx2Inch,
          });
        } else if (isBase64Image(bg.image.src)) {
          pptxSlide.background = { data: bg.image.src };
        } else {
          pptxSlide.background = { path: bg.image.src };
        }
      } else if (bg.type === 'solid' && bg.color) {
        const c = formatColor(bg.color);
        pptxSlide.background = {
          color: c.color,
          transparency: (1 - c.alpha) * 100,
        };
      } else if (bg.type === 'gradient' && bg.gradient) {
        const colors = bg.gradient.colors;
        const color1 = colors[0].color;
        const color2 = colors[colors.length - 1].color;
        const mixed = tinycolor.mix(color1, color2).toHexString();
        const c = formatColor(mixed);
        pptxSlide.background = {
          color: c.color,
          transparency: (1 - c.alpha) * 100,
        };
      }
    }

    if (!slide.elements) continue;

    // ── Elements ──
    for (const el of slide.elements) {
      // ── TEXT ──
      if (el.type === 'text') {
        const exportBoxes = buildTextExportBoxes({
          element: el,
          slide,
          textExportLayoutMap,
          viewportHeightPx: viewportSize * viewportRatio,
        });

        for (const box of exportBoxes) {
          const textProps = formatHTML(box.content, ratioPx2Pt);
          const options: pptxgen.TextPropsOptions = {
            x: el.left / ratioPx2Inch,
            y: box.topPx / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: box.heightPx / ratioPx2Inch,
            fontSize: DEFAULT_FONT_SIZE / ratioPx2Pt,
            fontFace: el.defaultFontName || DEFAULT_FONT_FAMILY,
            color: '#000000',
            valign: 'top',
            margin: 10 / ratioPx2Pt,
            paraSpaceBefore: 5 / ratioPx2Pt,
            lineSpacingMultiple: 1.5 / 1.25,
            fit: box.measuredHeightPx > box.heightPx ? 'shrink' : 'none',
          };
          if (el.rotate) options.rotate = el.rotate;
          if (el.wordSpace) options.charSpacing = el.wordSpace / ratioPx2Pt;
          if (el.lineHeight) options.lineSpacingMultiple = el.lineHeight / 1.25;
          if (el.fill) {
            const c = formatColor(el.fill);
            const opacity = el.opacity === undefined ? 1 : el.opacity;
            options.fill = {
              color: c.color,
              transparency: (1 - c.alpha * opacity) * 100,
            };
          }
          if (el.defaultColor) options.color = formatColor(el.defaultColor).color;
          if (el.defaultFontName) options.fontFace = el.defaultFontName;
          if (el.shadow) options.shadow = getShadowOption(el.shadow, ratioPx2Pt);
          if (el.outline?.width)
            options.line = getOutlineOption(el.outline, ratioPx2Pt);
          if (el.opacity !== undefined) options.transparency = (1 - el.opacity) * 100;
          if (el.paragraphSpace !== undefined)
            options.paraSpaceBefore = el.paragraphSpace / ratioPx2Pt;
          if (el.vertical) options.vert = 'eaVert';

          pptxSlide.addText(textProps, options);
        }
      }

      // ── IMAGE ──
      else if (el.type === 'image') {
        // Resolve placeholder src → actual image data
        let resolvedSrc = resolveKnowledgeMediaSrc(el.src);
        if (isMediaPlaceholder(el.src)) {
          const task = useMediaGenerationStore.getState().tasks[el.src];
          if (task?.status === 'done' && task.objectUrl) {
            resolvedSrc = task.objectUrl;
          } else {
            continue; // Media not ready, skip
          }
        }

        // Fetch and convert to base64 for embedding in PPTX
        // (blob: URLs and remote URLs won't work in offline PPTX)
        if (!isBase64Image(resolvedSrc)) {
          try {
            const resp = await fetch(resolvedSrc);
            const blob = await resp.blob();
            resolvedSrc = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch {
            log.warn('Failed to convert image to base64, skipping element');
            continue;
          }
        }

        const options: pptxgen.ImageProps = {
          x: el.left / ratioPx2Inch,
          y: el.top / ratioPx2Inch,
          w: el.width / ratioPx2Inch,
          h: el.height / ratioPx2Inch,
        };
        if (isBase64Image(resolvedSrc)) options.data = resolvedSrc;
        else options.path = resolvedSrc;

        if (el.flipH) options.flipH = el.flipH;
        if (el.flipV) options.flipV = el.flipV;
        if (el.rotate) options.rotate = el.rotate;
        if (el.link) {
          const linkOption = getLinkOption(el.link, slides);
          if (linkOption) options.hyperlink = linkOption;
        }
        if (el.filters?.opacity) options.transparency = 100 - parseInt(el.filters.opacity);
        if (el.clip) {
          if (el.clip.shape === 'ellipse') options.rounding = true;

          const [start, end] = el.clip.range;
          const [startX, startY] = start;
          const [endX, endY] = end;

          const originW = el.width / ((endX - startX) / ratioPx2Inch);
          const originH = el.height / ((endY - startY) / ratioPx2Inch);

          options.w = originW / ratioPx2Inch;
          options.h = originH / ratioPx2Inch;

          options.sizing = {
            type: 'crop',
            x: ((startX / ratioPx2Inch) * originW) / ratioPx2Inch,
            y: ((startY / ratioPx2Inch) * originH) / ratioPx2Inch,
            w: (((endX - startX) / ratioPx2Inch) * originW) / ratioPx2Inch,
            h: (((endY - startY) / ratioPx2Inch) * originH) / ratioPx2Inch,
          };
        }

        pptxSlide.addImage(options);
      }

      // ── SHAPE ──
      else if (el.type === 'shape') {
        if (el.special) {
          // Special shapes: render as SVG image
          // Create a temporary SVG element from the path
          const svgNS = 'http://www.w3.org/2000/svg';
          const svg = document.createElementNS(svgNS, 'svg');
          svg.setAttribute('xmlns', svgNS);
          svg.setAttribute('viewBox', `0 0 ${el.viewBox[0]} ${el.viewBox[1]}`);
          svg.setAttribute('width', String(el.width));
          svg.setAttribute('height', String(el.height));

          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', el.path);
          path.setAttribute('fill', el.fill || 'none');
          if (el.outline?.color) {
            path.setAttribute('stroke', el.outline.color);
            path.setAttribute('stroke-width', String(el.outline.width || 1));
          }
          svg.appendChild(path);

          const base64SVG = svg2Base64(svg);

          const imgOptions: pptxgen.ImageProps = {
            data: base64SVG,
            x: el.left / ratioPx2Inch,
            y: el.top / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: el.height / ratioPx2Inch,
          };
          if (el.rotate) imgOptions.rotate = el.rotate;
          if (el.flipH) imgOptions.flipH = el.flipH;
          if (el.flipV) imgOptions.flipV = el.flipV;
          if (el.link) {
            const linkOption = getLinkOption(el.link, slides);
            if (linkOption) imgOptions.hyperlink = linkOption;
          }
          pptxSlide.addImage(imgOptions);
        } else {
          const scale = {
            x: el.width / el.viewBox[0],
            y: el.height / el.viewBox[1],
          };
          const points = formatPoints(toPoints(el.path), ratioPx2Inch, scale);

          let fillColor = formatColor(el.fill);
          if (el.gradient) {
            const colors = el.gradient.colors;
            const color1 = colors[0].color;
            const color2 = colors[colors.length - 1].color;
            const mixed = tinycolor.mix(color1, color2).toHexString();
            fillColor = formatColor(mixed);
          }
          if (el.pattern) fillColor = formatColor('#00000000');
          const opacity = el.opacity === undefined ? 1 : el.opacity;

          const shapeOptions: pptxgen.ShapeProps = {
            x: el.left / ratioPx2Inch,
            y: el.top / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: el.height / ratioPx2Inch,
            fill: {
              color: fillColor.color,
              transparency: (1 - fillColor.alpha * opacity) * 100,
            },
            points,
          };
          if (el.flipH) shapeOptions.flipH = el.flipH;
          if (el.flipV) shapeOptions.flipV = el.flipV;
          if (el.shadow) shapeOptions.shadow = getShadowOption(el.shadow, ratioPx2Pt);
          if (el.outline?.width) shapeOptions.line = getOutlineOption(el.outline, ratioPx2Pt);
          if (el.rotate) shapeOptions.rotate = el.rotate;
          if (el.link) {
            const linkOption = getLinkOption(el.link, slides);
            if (linkOption) shapeOptions.hyperlink = linkOption;
          }

          pptxSlide.addShape('custGeom' as pptxgen.ShapeType, shapeOptions);
        }

        // Shape text overlay
        if (el.text) {
          const textProps = formatHTML(el.text.content, ratioPx2Pt);
          const textOptions: pptxgen.TextPropsOptions = {
            x: el.left / ratioPx2Inch,
            y: el.top / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: el.height / ratioPx2Inch,
            fontSize: DEFAULT_FONT_SIZE / ratioPx2Pt,
            fontFace: DEFAULT_FONT_FAMILY,
            color: '#000000',
            paraSpaceBefore: 5 / ratioPx2Pt,
            valign: el.text.align,
          };
          if (el.rotate) textOptions.rotate = el.rotate;
          if (el.text.defaultColor) textOptions.color = formatColor(el.text.defaultColor).color;
          if (el.text.defaultFontName) textOptions.fontFace = el.text.defaultFontName;

          pptxSlide.addText(textProps, textOptions);
        }

        // Pattern overlay
        if (el.pattern) {
          const patternOptions: pptxgen.ImageProps = {
            x: el.left / ratioPx2Inch,
            y: el.top / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: el.height / ratioPx2Inch,
          };
          if (isBase64Image(el.pattern)) patternOptions.data = el.pattern;
          else patternOptions.path = el.pattern;

          if (el.flipH) patternOptions.flipH = el.flipH;
          if (el.flipV) patternOptions.flipV = el.flipV;
          if (el.rotate) patternOptions.rotate = el.rotate;
          if (el.link) {
            const linkOption = getLinkOption(el.link, slides);
            if (linkOption) patternOptions.hyperlink = linkOption;
          }
          pptxSlide.addImage(patternOptions);
        }
      }

      // ── LINE ──
      else if (el.type === 'line') {
        const path = getLineElementPath(el);
        const points = formatPoints(toPoints(path), ratioPx2Inch);
        const { minX, maxX, minY, maxY } = getElementRange(el);
        const c = formatColor(el.color);

        const lineOptions: pptxgen.ShapeProps = {
          x: el.left / ratioPx2Inch,
          y: el.top / ratioPx2Inch,
          w: (maxX - minX) / ratioPx2Inch,
          h: (maxY - minY) / ratioPx2Inch,
          line: {
            color: c.color,
            transparency: (1 - c.alpha) * 100,
            width: el.width / ratioPx2Pt,
            dashType: dashTypeMap[el.style] as 'solid' | 'dash' | 'sysDot',
            beginArrowType: el.points[0] ? 'arrow' : 'none',
            endArrowType: el.points[1] ? 'arrow' : 'none',
          },
          points,
        };
        if (el.shadow) lineOptions.shadow = getShadowOption(el.shadow, ratioPx2Pt);

        pptxSlide.addShape('custGeom' as pptxgen.ShapeType, lineOptions);
      }

      // ── CHART ──
      else if (el.type === 'chart') {
        const chartData = [];
        for (let i = 0; i < el.data.series.length; i++) {
          const item = el.data.series[i];
          chartData.push({
            name: `Series ${i + 1}`,
            labels: el.data.labels,
            values: item,
          });
        }

        let chartColors: string[] = [];
        if (el.themeColors.length === 10) {
          chartColors = el.themeColors.map((c) => formatColor(c).color);
        } else if (el.themeColors.length === 1) {
          chartColors = tinycolor(el.themeColors[0])
            .analogous(10)
            .map((c) => formatColor(c.toHexString()).color);
        } else {
          const len = el.themeColors.length;
          const supplement = tinycolor(el.themeColors[len - 1])
            .analogous(10 + 1 - len)
            .map((c) => c.toHexString());
          chartColors = [...el.themeColors.slice(0, len - 1), ...supplement].map(
            (c) => formatColor(c).color,
          );
        }

        const chartOptions: pptxgen.IChartOpts = {
          x: el.left / ratioPx2Inch,
          y: el.top / ratioPx2Inch,
          w: el.width / ratioPx2Inch,
          h: el.height / ratioPx2Inch,
          chartColors:
            el.chartType === 'pie' || el.chartType === 'ring'
              ? chartColors
              : chartColors.slice(0, el.data.series.length),
        };

        const textColor = formatColor(el.textColor || '#000000').color;
        chartOptions.catAxisLabelColor = textColor;
        chartOptions.valAxisLabelColor = textColor;

        const fontSize = 14 / ratioPx2Pt;
        chartOptions.catAxisLabelFontSize = fontSize;
        chartOptions.valAxisLabelFontSize = fontSize;

        if (el.fill || el.outline) {
          const plotArea: pptxgen.IChartPropsFillLine = {};
          if (el.fill) plotArea.fill = { color: formatColor(el.fill).color };
          if (el.outline) {
            plotArea.border = {
              pt: el.outline.width! / ratioPx2Pt,
              color: formatColor(el.outline.color!).color,
            };
          }
          chartOptions.plotArea = plotArea;
        }

        if (
          (el.data.series.length > 1 && el.chartType !== 'scatter') ||
          el.chartType === 'pie' ||
          el.chartType === 'ring'
        ) {
          chartOptions.showLegend = true;
          chartOptions.legendPos = 'b';
          chartOptions.legendColor = textColor;
          chartOptions.legendFontSize = fontSize;
        }

        let type = pptx.ChartType.bar;
        if (el.chartType === 'bar') {
          type = pptx.ChartType.bar;
          chartOptions.barDir = 'col';
          if (el.options?.stack) chartOptions.barGrouping = 'stacked';
        } else if (el.chartType === 'column') {
          type = pptx.ChartType.bar;
          chartOptions.barDir = 'bar';
          if (el.options?.stack) chartOptions.barGrouping = 'stacked';
        } else if (el.chartType === 'line') {
          type = pptx.ChartType.line;
          if (el.options?.lineSmooth) chartOptions.lineSmooth = true;
        } else if (el.chartType === 'area') {
          type = pptx.ChartType.area;
        } else if (el.chartType === 'radar') {
          type = pptx.ChartType.radar;
        } else if (el.chartType === 'scatter') {
          type = pptx.ChartType.scatter;
          chartOptions.lineSize = 0;
        } else if (el.chartType === 'pie') {
          type = pptx.ChartType.pie;
        } else if (el.chartType === 'ring') {
          type = pptx.ChartType.doughnut;
          chartOptions.holeSize = 60;
        }

        pptxSlide.addChart(type, chartData, chartOptions);
      }

      // ── TABLE ──
      else if (el.type === 'table') {
        const hiddenCells: string[] = [];
        for (let i = 0; i < el.data.length; i++) {
          const rowData = el.data[i];
          for (let j = 0; j < rowData.length; j++) {
            const cell = rowData[j];
            if (cell.colspan > 1 || cell.rowspan > 1) {
              for (let row = i; row < i + cell.rowspan; row++) {
                for (let col = row === i ? j + 1 : j; col < j + cell.colspan; col++) {
                  hiddenCells.push(`${row}_${col}`);
                }
              }
            }
          }
        }

        const tableData: pptxgen.TableRow[] = [];

        const theme = el.theme;
        let themeColor: FormatColor | null = null;
        let subThemeColors: FormatColor[] = [];
        if (theme) {
          themeColor = formatColor(theme.color);
          subThemeColors = getTableSubThemeColor(theme.color).map((item) => formatColor(item));
        }

        for (let i = 0; i < el.data.length; i++) {
          const row = el.data[i];
          const _row: pptxgen.TableCell[] = [];

          for (let j = 0; j < row.length; j++) {
            const cell = row[j];
            const cellOptions: pptxgen.TableCellProps = {
              colspan: cell.colspan,
              rowspan: cell.rowspan,
              bold: cell.style?.bold || false,
              italic: cell.style?.em || false,
              underline: { style: cell.style?.underline ? 'sng' : 'none' },
              align: cell.style?.align || 'left',
              valign: 'middle',
              fontFace: cell.style?.fontname || DEFAULT_FONT_FAMILY,
              fontSize: (cell.style?.fontsize ? parseInt(cell.style.fontsize) : 14) / ratioPx2Pt,
            };
            if (theme && themeColor) {
              let c: FormatColor;
              if (i % 2 === 0) c = subThemeColors[1];
              else c = subThemeColors[0];

              if (theme.rowHeader && i === 0) c = themeColor;
              else if (theme.rowFooter && i === el.data.length - 1) c = themeColor;
              else if (theme.colHeader && j === 0) c = themeColor;
              else if (theme.colFooter && j === row.length - 1) c = themeColor;

              cellOptions.fill = {
                color: c.color,
                transparency: (1 - c.alpha) * 100,
              };
            }
            if (cell.style?.backcolor) {
              const c = formatColor(cell.style.backcolor);
              cellOptions.fill = {
                color: c.color,
                transparency: (1 - c.alpha) * 100,
              };
            }
            if (cell.style?.color) cellOptions.color = formatColor(cell.style.color).color;

            if (!hiddenCells.includes(`${i}_${j}`)) {
              _row.push({ text: cell.text, options: cellOptions });
            }
          }
          if (_row.length) tableData.push(_row);
        }

        const tableOptions: pptxgen.TableProps = {
          x: el.left / ratioPx2Inch,
          y: el.top / ratioPx2Inch,
          w: el.width / ratioPx2Inch,
          h: el.height / ratioPx2Inch,
          colW: el.colWidths.map((item) => (el.width * item) / ratioPx2Inch),
        };
        if (el.theme) tableOptions.fill = { color: '#ffffff' };
        if (el.outline.width && el.outline.color) {
          tableOptions.border = {
            type: el.outline.style === 'solid' ? 'solid' : 'dash',
            pt: el.outline.width / ratioPx2Pt,
            color: formatColor(el.outline.color).color,
          };
        }

        pptxSlide.addTable(tableData, tableOptions);
      }

      // ── LATEX ──
      else if (el.type === 'latex') {
        // Try native OMML formula first (editable in PowerPoint)
        // Estimate line count from \\ line breaks to compute a fitting font size.
        // Formula rendered height ≈ lines * 1.5 * fontSize, so fontSize ≈ boxHeight / (lines * 1.5)
        const lineBreaks = (el.latex?.match(/\\\\/g) || []).length;
        const lines = lineBreaks + 1;
        const boxHeightPt = el.height / ratioPx2Pt;
        const fontSize = Math.round(boxHeightPt / (lines * 3));
        const omml = el.latex ? latexToOmml(el.latex, fontSize) : null;

        if (omml) {
          pptxSlide.addFormula({
            omml,
            x: el.left / ratioPx2Inch,
            y: el.top / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: el.height / ratioPx2Inch,
            fontSize,
            align: el.align,
          });
        } else if (el.path) {
          // Fallback: render as SVG image (non-editable)
          const range = getSvgPathRange(el.path);
          const sw = el.strokeWidth || 0;
          const vbX = range.minX - sw;
          const vbY = range.minY - sw;
          const vbW = range.maxX - range.minX + sw * 2;
          const vbH = range.maxY - range.minY + sw * 2;

          const svgNS = 'http://www.w3.org/2000/svg';
          const svg = document.createElementNS(svgNS, 'svg');
          svg.setAttribute('xmlns', svgNS);
          svg.setAttribute('width', String(el.width));
          svg.setAttribute('height', String(el.height));
          svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
          svg.setAttribute('stroke', el.color || '#000000');
          svg.setAttribute('stroke-width', String(sw));
          svg.setAttribute('fill', 'none');
          svg.setAttribute('stroke-linecap', 'round');
          svg.setAttribute('stroke-linejoin', 'round');

          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', el.path);
          svg.appendChild(path);

          const base64SVG = svg2Base64(svg);
          if (!base64SVG) continue;

          const latexOptions: pptxgen.ImageProps = {
            data: base64SVG,
            x: el.left / ratioPx2Inch,
            y: el.top / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: el.height / ratioPx2Inch,
          };
          if (el.link) {
            const linkOption = getLinkOption(el.link, slides);
            if (linkOption) latexOptions.hyperlink = linkOption;
          }

          pptxSlide.addImage(latexOptions);
        }
      }

      // ── VIDEO / AUDIO ──
      else if (el.type === 'video' || el.type === 'audio') {
        // Resolve placeholder src → blob URL from media generation store
        let resolvedSrc = resolveKnowledgeMediaSrc(el.src);
        if (isMediaPlaceholder(el.src)) {
          const task = useMediaGenerationStore.getState().tasks[el.src];
          if (task?.status === 'done' && task.objectUrl) {
            resolvedSrc = task.objectUrl;
          } else {
            continue; // Media not ready, skip
          }
        }

        // Fetch blob and convert to base64 for embedding in PPTX
        // (blob: URLs and remote URLs won't work in offline PPTX)
        try {
          const resp = await fetch(resolvedSrc);
          const blob = await resp.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const mediaOptions: pptxgen.MediaProps = {
            x: el.left / ratioPx2Inch,
            y: el.top / ratioPx2Inch,
            w: el.width / ratioPx2Inch,
            h: el.height / ratioPx2Inch,
            data: base64,
            type: el.type,
          };

          // Determine file extension
          const extMatch = resolvedSrc.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
          if (extMatch && extMatch[1]) mediaOptions.extn = extMatch[1];
          else if (el.ext) mediaOptions.extn = el.ext;
          else mediaOptions.extn = el.type === 'video' ? 'mp4' : 'mp3';

          // Generate cover image for video
          if (el.type === 'video') {
            let coverBase64: string | undefined;

            // 1. Try poster from element or media generation store
            let posterUrl = resolveKnowledgeMediaPoster(
              el.src,
              'poster' in el && el.poster ? el.poster : undefined,
            );
            if (!posterUrl && isMediaPlaceholder(el.src)) {
              const task = useMediaGenerationStore.getState().tasks[el.src];
              if (task?.poster) posterUrl = task.poster;
            }
            if (posterUrl) {
              try {
                const posterResp = await fetch(posterUrl);
                const posterBlob = await posterResp.blob();
                coverBase64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(posterBlob);
                });
              } catch {
                // Poster fetch failed, fall through to video frame capture
              }
            }

            // 2. Fallback: capture first frame from video via canvas
            if (!coverBase64) {
              try {
                coverBase64 = await new Promise<string>((resolve, reject) => {
                  const video = document.createElement('video');
                  video.crossOrigin = 'anonymous';
                  video.muted = true;
                  video.preload = 'auto';
                  video.onloadeddata = () => {
                    video.currentTime = 0;
                  };
                  video.onseeked = () => {
                    try {
                      const canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth || el.width;
                      canvas.height = video.videoHeight || el.height;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/png'));
                      } else {
                        reject(new Error('No canvas context'));
                      }
                      video.src = ''; // Release
                    } catch (e) {
                      reject(e);
                    }
                  };
                  video.onerror = () => reject(new Error('Video load failed'));
                  // Timeout to avoid hanging
                  setTimeout(() => reject(new Error('Video frame capture timeout')), 10000);
                  video.src = resolvedSrc;
                });
              } catch {
                // Frame capture also failed, video will use default play button
              }
            }

            if (coverBase64) mediaOptions.cover = coverBase64;
          }

          pptxSlide.addMedia(mediaOptions);
        } catch (err) {
          log.warn(`Failed to embed ${el.type} element:`, err);
        }
      }
    }
  }

  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

// ── Hook ──

export function useExportPPTX() {
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const { t } = useI18n();

  const scenes = useStageStore((s) => s.scenes);
  const stage = useStageStore((s) => s.stage);
  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();

  const ratioPx2Inch = 96 * (viewportSize / 960);
  const ratioPx2Pt = (96 / 72) * (viewportSize / 960);

  const slideScenes = scenes.filter((s) => s.content.type === 'slide');
  const slides = slideScenes.map((s) => (s.content as SlideContent).canvas);

  // Shared guard + state wrapper for export actions
  const withExportGuard = useCallback(
    (action: () => Promise<void>) => {
      if (exportingRef.current || slides.length === 0) return;
      exportingRef.current = true;
      setExporting(true);
      setTimeout(async () => {
        try {
          await action();
        } catch (err) {
          log.error('Export failed:', err);
          toast.error(t('export.exportFailed'));
        } finally {
          exportingRef.current = false;
          setExporting(false);
        }
      }, 100);
    },
    [slides.length, t],
  );

  // ── Export PPTX only ──
  const exportPPTX = useCallback(() => {
    withExportGuard(async () => {
      const fileName = stage?.name || 'slides';
      const blob = await buildPptxBlob(
        stage,
        slides,
        slideScenes,
        viewportRatio,
        viewportSize,
        ratioPx2Inch,
        ratioPx2Pt,
      );
      saveAs(blob, `${fileName}.pptx`);
      toast.success(t('export.exportSuccess'));
    });
  }, [
    withExportGuard,
    slides,
    slideScenes,
    stage,
    viewportSize,
    viewportRatio,
    ratioPx2Inch,
    ratioPx2Pt,
    t,
  ]);

  // ── Export Resource Pack (PPTX + interactive HTML pages as ZIP) ──
  const exportResourcePack = useCallback(() => {
    withExportGuard(async () => {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const fileName = stage?.name || 'slides';

      // 1. Generate PPTX
      const pptxBlob = await buildPptxBlob(
        stage,
        slides,
        slideScenes,
        viewportRatio,
        viewportSize,
        ratioPx2Inch,
        ratioPx2Pt,
      );
      zip.file(`${fileName}.pptx`, pptxBlob);

      // 2. Add interactive HTML pages
      let interactiveIndex = 0;
      for (const scene of scenes) {
        if (scene.content.type === 'interactive' && scene.content.html) {
          interactiveIndex++;
          const safeName = scene.title.replace(/[\\/:*?"<>|]/g, '_');
          const htmlFileName = `interactive/${String(interactiveIndex).padStart(2, '0')}_${safeName}.html`;
          zip.file(htmlFileName, scene.content.html);
        }
      }

      // 3. Add structured generation context
      zip.file(
        'context.json',
        JSON.stringify(buildGenerationContextExport(stage, scenes), null, 2),
      );

      // 4. Download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${fileName}.zip`);
      toast.success(t('export.exportSuccess'));
    });
  }, [
    withExportGuard,
    slides,
    slideScenes,
    scenes,
    stage,
    viewportSize,
    viewportRatio,
    ratioPx2Inch,
    ratioPx2Pt,
    t,
  ]);

  const exportContextJson = useCallback(() => {
    withExportGuard(async () => {
      const fileName = stage?.name || 'slides';
      const contextBlob = new Blob([JSON.stringify(buildGenerationContextExport(stage, scenes), null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      saveAs(contextBlob, `${fileName}.context.json`);
      toast.success(t('export.exportSuccess'));
    });
  }, [withExportGuard, stage, scenes, t]);

  return { exporting, exportPPTX, exportResourcePack, exportContextJson };
}
