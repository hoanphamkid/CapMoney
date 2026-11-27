import { expect, test } from '@playwright/test';

test('opens the welcome dialog on launch and lets users dismiss it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 750 });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions: [] } });
    if (path === '/api/loans') return route.fulfill({ json: { loans: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  const welcome = page.getByRole('dialog', { name: 'Chào mừng đến với CapMoney' });
  await page.goto('/app');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('button', { name: 'Đóng lời chào' })).toBeFocused();
  await welcome.getByRole('button', { name: 'Vào CapMoney' }).click();
  await expect(welcome).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Vay & cho mượn' }).click();
  await expect(page.getByRole('heading', { name: 'Vay & cho mượn' })).toBeVisible();
  await expect(welcome).toHaveCount(0);

  await page.reload();
  await expect(welcome).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(welcome).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Vay & cho mượn' })).toBeVisible();

  await page.reload();
  await welcome.getByRole('button', { name: 'Đóng lời chào' }).click();
  await expect(welcome).toHaveCount(0);
});

test('shows the wallet and credit on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 620 });
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED' } } }));

  await page.goto('/login');
  const welcome = page.getByRole('dialog', { name: 'Chào mừng đến với CapMoney' });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByText('Hoàn Phạm vibe code', { exact: true })).toBeVisible();
  await expect(welcome.locator('img')).toHaveJSProperty('naturalWidth', 192);
  await expect(welcome.getByRole('button')).toHaveCount(2);
  expect(await welcome.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await welcome.getByRole('button', { name: 'Vào CapMoney' }).click();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mừng bạn trở lại.' })).toBeVisible();
});
