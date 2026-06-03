import { test, expect } from '@playwright/test';
import { AppPage } from './pages/AppPage';

test.describe('AdminPanel — Node Management', () => {
  test('navigates to admin panel via global nav', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await app.navigateTo('admin');
    await expect(page.getByText('Node Management')).toBeVisible({ timeout: 8000 });
  });

  test('global nav is visible on admin view', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await app.navigateTo('admin');
    const nav = await app.getGlobalNav();
    await expect(nav).toBeVisible({ timeout: 8000 });
  });

  test('Add Node button shows add pod form', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await app.navigateTo('admin');
    await page.getByRole('button', { name: /add node/i }).click();
    await expect(page.getByText('Add Device')).toBeVisible({ timeout: 5000 });
  });

  test('manual entry tab renders pod form fields', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await app.navigateTo('admin');
    await page.getByRole('button', { name: /add node/i }).click();
    await page.getByRole('button', { name: /manual entry/i }).click();
    await expect(page.getByPlaceholder('192.168.100.11')).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder(/node 1/i)).toBeVisible();
  });

  test('credential identity form inputs are present', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await app.navigateTo('admin');
    await expect(page.getByPlaceholder('identity name')).toBeVisible({ timeout: 8000 });
    await expect(page.getByPlaceholder('username')).toBeVisible();
  });
});
