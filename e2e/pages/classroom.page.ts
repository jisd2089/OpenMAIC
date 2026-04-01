import type { Page, Locator } from '@playwright/test';

export class ClassroomPage {
  readonly page: Page;
  readonly loadingText: Locator;
  readonly sidebarScenes: Locator;
  readonly classroomOpsTab: Locator;
  readonly teacherViewButton: Locator;
  readonly studentViewButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loadingText = page.getByText('Loading classroom...');
    this.sidebarScenes = page.locator('[data-testid="scene-item"]');
    this.classroomOpsTab = page
      .getByRole('tab', { name: /Classroom Ops/i })
      .or(page.getByRole('tab', { name: /课堂操作/i }));
    this.teacherViewButton = page
      .getByRole('button', { name: /Teacher View/i })
      .or(page.getByRole('button', { name: /教师端/i }));
    this.studentViewButton = page
      .getByRole('button', { name: /Student View/i })
      .or(page.getByRole('button', { name: /学生端/i }));
  }

  async goto(stageId: string) {
    await this.page.goto(`/classroom/${stageId}`);
  }

  async gotoStudent(stageId: string) {
    await this.page.goto(`/classroom/${stageId}?view=student`);
  }

  async switchToStudentView() {
    await this.studentViewButton.click();
  }

  async waitForLoaded() {
    await this.loadingText.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  async clickScene(index: number) {
    await this.sidebarScenes.nth(index).click();
  }

  /** Get scene title — it's the second span (first is the number badge) */
  getSceneTitle(index: number) {
    return this.sidebarScenes.nth(index).locator('[data-testid="scene-title"]');
  }
}
