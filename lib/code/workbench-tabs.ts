export const CODE_WORKBENCH_TAB = 'code-runner';

export function isCodeWorkbenchTab(tab: string | null | undefined) {
  return tab === CODE_WORKBENCH_TAB;
}
