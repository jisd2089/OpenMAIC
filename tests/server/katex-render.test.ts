import { describe, expect, it } from 'vitest';
import { renderKatexToHtml } from '@/lib/utils/katex';

describe('renderKatexToHtml', () => {
  it('renders display formulas containing line breaks without surfacing KaTeX strict warnings', () => {
    const html = renderKatexToHtml(String.raw`\frac{1}{2} \\ \frac{3}{4}`);

    expect(html).toContain('katex');
  });
});
