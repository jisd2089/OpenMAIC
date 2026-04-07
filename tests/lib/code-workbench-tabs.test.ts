import { describe, expect, it } from 'vitest';
import { CODE_WORKBENCH_TAB, isCodeWorkbenchTab } from '@/lib/code/workbench-tabs';

describe('code workbench tabs', () => {
  it('uses a stable tab id for the right-side code workbench', () => {
    expect(CODE_WORKBENCH_TAB).toBe('code-runner');
  });

  it('identifies the active code workbench tab correctly', () => {
    expect(isCodeWorkbenchTab('code-runner')).toBe(true);
    expect(isCodeWorkbenchTab('lecture')).toBe(false);
    expect(isCodeWorkbenchTab('chat')).toBe(false);
    expect(isCodeWorkbenchTab(null)).toBe(false);
  });
});
