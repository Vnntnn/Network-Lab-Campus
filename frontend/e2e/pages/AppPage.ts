import type { Page } from '@playwright/test';

export class AppPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async navigateTo(view: 'topology' | 'admin' | 'instructor' | 'orchestrator') {
    const labels = {
      topology: 'Topology',
      admin: 'Manage Nodes',
      instructor: 'Instructor',
      orchestrator: 'Orchestrator',
    };
    await this.page.getByRole('button', { name: labels[view] }).click();
  }

  async getGlobalNav() {
    return this.page.locator('[data-testid="global-nav"]');
  }
}
