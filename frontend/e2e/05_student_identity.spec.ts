import { test, expect } from '@playwright/test';
import { AppPage } from './pages/AppPage';

test.describe('StudentIdentity badge', () => {
  test.beforeEach(async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await expect(page.getByText(/topology intelligence/i)).toBeVisible({ timeout: 8000 });
  });

  test('badge is visible on non-selector views', async ({ page }) => {
    await expect(page.locator('.fixed.bottom-4.left-4')).toBeVisible({ timeout: 5000 });
  });

  test('clicking badge opens name input', async ({ page }) => {
    const badge = page.locator('.fixed.bottom-4.left-4');
    await badge.click();
    await expect(page.getByPlaceholder('your name')).toBeVisible({ timeout: 3000 });
  });

  test('typing and saving name updates the badge', async ({ page }) => {
    const badge = page.locator('.fixed.bottom-4.left-4');
    await badge.click();
    const input = page.getByPlaceholder('your name');
    await input.fill('Alice');
    await input.press('Enter');
    await expect(page.getByText('Alice')).toBeVisible({ timeout: 3000 });
  });

  test('clearing name resets badge to "Set name"', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('actor_name'));
    await page.reload();
    await page.getByRole('button', { name: /topology/i }).first().click();
    await expect(page.getByText('Set name')).toBeVisible({ timeout: 8000 });
  });

  test('pressing Escape cancels edit without saving', async ({ page }) => {
    const badge = page.locator('.fixed.bottom-4.left-4');
    await badge.click();
    const input = page.getByPlaceholder('your name');
    await input.fill('ShouldNotSave');
    await input.press('Escape');
    await expect(page.getByPlaceholder('your name')).not.toBeVisible({ timeout: 2000 });
    await expect(page.getByText('ShouldNotSave')).not.toBeVisible();
  });
});
