import { test, expect } from '@playwright/test';
import { AppPage } from './pages/AppPage';

test.describe('PodSelector — 3D campus view', () => {
  test('shows "Network Lab Campus" title in nav on load', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await expect(page.getByText('Network Lab Campus')).toBeVisible();
  });

  test('shows empty-state hint when no pods configured', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await expect(
      page.getByText(/no nodes configured yet|add your first node|select a pod/i)
    ).toBeVisible({ timeout: 8000 });
  });

  test('nav buttons are visible: Topology, Orchestrator, Instructor', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await expect(page.getByRole('button', { name: /topology/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /orchestrator/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /instructor/i })).toBeVisible();
  });

  test('clicking Topology navigates away from selector', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await expect(page.getByText(/topology intelligence/i)).toBeVisible({ timeout: 8000 });
  });
});
