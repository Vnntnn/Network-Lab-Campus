import { test, expect } from '@playwright/test';

test.describe('CommandBuilder', () => {
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
    });
    await page.reload();
    const appStore = await page.evaluate(() =>
      localStorage.getItem('app-store')
    );
    if (!appStore || !appStore.includes('"view":"builder"')) {
      await page.evaluate(() => {
        localStorage.setItem(
          'app-store',
          JSON.stringify({ state: { view: 'builder' }, version: 0 })
        );
      });
      await page.reload();
    }
  });

  test('Show Run button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /show run/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('History button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /history/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('Routes button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /routes/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('Snapshots button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /snapshots/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('snapshot drawer opens on Snapshots button click', async ({ page }) => {
    await page.getByRole('button', { name: /snapshots/i }).click();
    await expect(page.getByText('Snapshots')).toBeVisible({ timeout: 5000 });
  });

  test('snapshot drawer closes on X button click', async ({ page }) => {
    await page.getByRole('button', { name: /snapshots/i }).click();
    await page.getByRole('button', { name: /close snapshots/i }).click();
    await expect(page.getByText('No snapshots yet.')).not.toBeVisible({ timeout: 3000 });
  });
});
