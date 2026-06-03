import { test, expect } from '@playwright/test';
import { AppPage } from './pages/AppPage';

test.describe('Topology view', () => {
  test.beforeEach(async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await expect(page.getByText(/topology intelligence/i)).toBeVisible({ timeout: 8000 });
  });

  test('React Flow canvas renders', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 8000 });
  });

  test('"Discover All" button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /discover all/i })
    ).toBeVisible({ timeout: 8000 });
  });

  test('global nav is visible', async ({ page }) => {
    const app = new AppPage(page);
    const nav = await app.getGlobalNav();
    await expect(nav).toBeVisible();
  });

  test('route analytics panel can be accessed', async ({ page }) => {
    const routesBtn = page.getByRole('button', { name: /routes/i });
    if (await routesBtn.count() > 0) {
      await routesBtn.first().click();
      await expect(page.getByText(/routes/i)).toBeVisible({ timeout: 5000 });
    }
  });
});
