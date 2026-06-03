import { test, expect } from '@playwright/test';

test.describe('Snapshot compare / diff', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const pod = {
        id: 1,
        pod_number: 1,
        pod_name: 'Test-Node-1',
        device_ip: '192.168.100.11',
        device_type: 'cisco_iosxe',
        connection_protocol: 'telnet',
        description: '',
      };
      localStorage.setItem('pod-store', JSON.stringify({ state: { selectedPod: pod }, version: 0 }));
      localStorage.setItem('app-store', JSON.stringify({ state: { view: 'builder' }, version: 0 }));
    });
    await page.reload();
    await page.getByRole('button', { name: /snapshots/i }).click();
    await expect(page.getByText('Snapshots')).toBeVisible({ timeout: 8000 });
  });

  test('snapshot drawer opens and shows header', async ({ page }) => {
    await expect(page.getByText('Snapshots')).toBeVisible();
  });

  test('Compare mode toggle button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /compare/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('clicking Compare enters compare mode', async ({ page }) => {
    await page.getByRole('button', { name: /compare/i }).click();
    await expect(
      page.getByText(/click a snapshot to set baseline/i)
    ).toBeVisible({ timeout: 3000 });
  });

  test('Capture button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /capture/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('close button dismisses snapshot drawer', async ({ page }) => {
    await page.getByTitle('Close snapshots').click();
    await expect(
      page.getByText('Click a snapshot to set baseline…')
    ).not.toBeVisible({ timeout: 3000 });
  });
});
