import { expect, test } from '@playwright/test';

test('keeps the search filter while moving between matching calendar days', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const dateKey = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const firstMatch = dateKey(5);
  const emptyMatch = dateKey(6);
  const secondMatch = dateKey(8);
  const transactions = [
    { id: 'first', type: 'expense', amount: 243000, amountMinor: 243000, note: 'bim đầu tháng', categoryId: 'food', walletId: 'wallet', dateKey: firstMatch, status: 'posted', imageUrl: null },
    { id: 'empty', type: 'expense', amount: 12000, amountMinor: 12000, note: 'cà phê', categoryId: 'food', walletId: 'wallet', dateKey: emptyMatch, status: 'posted', imageUrl: null },
    { id: 'second', type: 'expense', amount: 54000, amountMinor: 54000, note: 'bim cuối tuần', categoryId: 'food', walletId: 'wallet', dateKey: secondMatch, status: 'posted', imageUrl: null },
  ];

  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app');
  await page.locator('.cm-icon-circle[aria-label="Tìm kiếm"]').click();
  await page.locator('.cm-search-bar input').fill('bim');

  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  await page.locator('.cm-day-slot').nth(firstDayOffset + 4).click();
  await expect(page.locator('.cm-day-view-title h2')).toContainText('5 thg');
  await expect(page.locator('.cm-day-view-body')).toContainText('bim đầu tháng');

  await page.getByRole('button', { name: /Ngày sau/ }).click();
  await expect(page.locator('.cm-day-view-title h2')).toContainText('8 thg');
  await expect(page.locator('.cm-day-view-body')).toContainText('bim cuối tuần');
  await expect(page.getByRole('button', { name: /Ngày trước/ })).toBeEnabled();
});
