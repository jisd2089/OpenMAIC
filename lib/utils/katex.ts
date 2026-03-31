import katex from 'katex';

const IGNORABLE_KATEX_STRICT_CODES = new Set(['newLineInDisplayMode']);

export function renderKatexToHtml(latex: string): string {
  return katex.renderToString(latex, {
    throwOnError: false,
    displayMode: true,
    output: 'html',
    strict: (errorCode) =>
      IGNORABLE_KATEX_STRICT_CODES.has(errorCode) ? 'ignore' : 'warn',
  });
}
