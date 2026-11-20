import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

test('dims the screen once per photo change in the lookback reel', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-20T05:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-20T05:01:00Z'));
  const transactions = ['Bánh mì', 'Sữa'].map((note, index) => ({
    id: String(index + 1), note, type: 'expense', amount: 15000, amountMinor: 1500000, categoryId: 'food',
    walletId: 'wallet', dateKey: '2026-11-20', transactionTime: '10:00:00', source: 'manual', status: 'posted', imageUrl: null,
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions } });
    if (path === '/api/wallets') return route.fulfill({ json: { wallets: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app');
  await expect(page.locator('.cm-summary-cards')).toContainText('30.000');
  await page.getByRole('button', { name: 'Sau 1 ngày', exact: true }).click();
  const reel = page.locator('.cm-story-overlay');
  const fade = reel.locator('.cm-story-photo-fade');
  const frame = reel.locator('.cm-swipe-hint');
  await expect(frame).toHaveText('Ảnh 1/2');
  await expect(fade).toHaveCount(0);
  await expect(reel.getByRole('button', { name: /Tự đổi FX|Lật 3D|Zoom Flash/ })).toHaveCount(0);

  await reel.getByRole('button', { name: 'Tạm dừng' }).click();
  await reel.getByRole('button', { name: 'Ảnh tiếp theo' }).click();
  await expect(frame).toHaveText('Ảnh 2/2');
  await expect(fade).toHaveCSS('animation-name', 'storyPhotoFade');
  await expect(fade).toHaveCSS('animation-iteration-count', '1');
  const manualFade = await fade.elementHandle();
  await reel.getByRole('button', { name: 'Ảnh 2', exact: true }).click();
  expect(await manualFade?.evaluate(element => element.isConnected)).toBe(true);

  await reel.getByRole('button', { name: 'Phát tiếp' }).click();
  await page.clock.runFor(1000);
  await expect(frame).toHaveText('Ảnh 1/2');
  await expect(fade).toHaveCount(1);
  expect(await manualFade?.evaluate(element => element.isConnected)).toBe(false);
});
