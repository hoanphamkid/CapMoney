import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

test('filters income and expenses by time across month boundaries and restores the default report', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.clock.setFixedTime(new Date('2026-11-04T05:00:00Z'));
  const rows = [
    { type: 'income', categoryId: 'salary', note: 'Lương hôm nay', dateKey: '2026-11-04', amount: 100_000 },
    { type: 'income', categoryId: 'salary', note: 'Lương cuối tháng trước', dateKey: '2026-10-31', amount: 200_000 },
    { type: 'income', categoryId: 'salary', note: 'Lương đầu tháng trước', dateKey: '2026-10-07', amount: 400_000 },
    { type: 'income', categoryId: 'salary', note: 'Lương quá 30 ngày', dateKey: '2026-10-05', amount: 800_000 },
    { type: 'income', categoryId: 'bonus', note: 'Thưởng hôm nay', dateKey: '2026-11-04', amount: 30_000 },
    { type: 'expense', categoryId: 'food', note: 'Ăn sáng hôm nay', dateKey: '2026-11-04', amount: 40_000 },
    { type: 'expense', categoryId: 'food', note: 'Ăn sáng cuối tháng trước', dateKey: '2026-10-31', amount: 60_000 },
    { type: 'expense', categoryId: 'shopping', note: 'Mua áo hôm nay', dateKey: '2026-11-04', amount: 90_000 },
  ].map((row, index) => ({ ...row, id: String(index), walletId: 'wallet', amountMinor: row.amount * 100, imageUrl: null }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions: rows } });
    if (path === '/api/wallets') return route.fulfill({ json: { wallets: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app/dashboard');
  await page.getByRole('button', { name: 'Tiền vào', exact: true }).click();
  await page.getByRole('combobox', { name: 'Loại tiền vào', exact: true }).selectOption('salary');
  const summary = page.locator('.cm-report-summary');
  const periods = page.getByRole('group', { name: 'Lọc theo thời gian' });
  const recent = page.getByRole('region', { name: 'Danh sách giao dịch gần đây' });
  await expect(periods.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(summary).toContainText('100.000');
  await expect(recent.getByRole('button')).toHaveCount(4);

  await periods.getByRole('button', { name: /^1 ngày/ }).click();
  await expect(recent.getByRole('button')).toHaveCount(1);
  await periods.getByRole('button', { name: /^1 tuần/ }).click();
  await expect(page.locator('.cm-report-range')).toHaveText('29/10/2026 – 04/11/2026');
  await expect(summary).toContainText('300.000');
  await expect(recent.getByRole('button')).toHaveCount(2);
  await periods.getByRole('button', { name: /^1 tháng/ }).click();
  await expect(summary).toContainText('700.000');
  await expect(recent.getByRole('button')).toHaveCount(3);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất CSV theo thời gian đã chọn' }).click(),
  ]);
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Lương cuối tháng trước');
  expect(csv).not.toContain('Lương quá 30 ngày');
  expect(csv).not.toContain('Thưởng hôm nay');

  await page.getByRole('button', { name: 'Bỏ lọc thời gian' }).click();
  await expect(page.getByRole('heading', { name: 'Báo cáo tháng' })).toBeVisible();
  await expect(recent.getByRole('button')).toHaveCount(4);
  await page.getByRole('button', { name: 'Tiền ra', exact: true }).click();
  await page.getByRole('combobox', { name: 'Danh mục chi', exact: true }).selectOption('food');
  const week = periods.getByRole('button', { name: /^1 tuần/ });
  await week.click();
  await expect(summary).toContainText('100.000');
  await expect(recent.getByRole('button')).toHaveCount(2);
  await expect(recent).not.toContainText('Mua áo hôm nay');
  await week.click();
  await expect(week).toHaveAttribute('aria-pressed', 'false');
  await expect(summary).toContainText('130.000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('groups recent transactions by date and shows more on the same page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.clock.setFixedTime(new Date('2026-11-27T05:00:00Z'));
  const transactions = Array.from({ length: 9 }, (_, index) => ({
    id: String(index),
    type: index % 3 === 0 ? 'income' : 'expense',
    categoryId: index % 3 === 0 ? 'salary' : 'food',
    note: index === 0 ? 'MBVCB.17236015067.280923.Noi dung giao dich ngan hang rat dai' : `Giao dịch số ${index + 1}`,
    amount: index === 0 ? 1_000_000_000_000 : 52_000,
    amountMinor: index === 0 ? 100_000_000_000_000 : 5_200_000,
    dateKey: `2026-11-${27 - Math.floor(index / 3)}`,
    transactionTime: `1${8 - index}:30:00`,
    walletId: 'wallet',
    imageUrl: null,
  }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions } });
    if (path === '/api/wallets') return route.fulfill({ json: { wallets: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app/dashboard');
  const panel = page.getByRole('region', { name: 'Giao dịch gần đây', exact: true });
  const rows = panel.getByRole('region', { name: 'Danh sách giao dịch gần đây' }).getByRole('button');
  await expect(rows).toHaveCount(6);
  await expect(panel.getByRole('heading', { name: /Hôm nay.*27\/11\/2026/ })).toBeVisible();
  await expect(panel.getByRole('heading', { name: /Hôm qua.*26\/11\/2026/ })).toBeVisible();
  await expect(rows.first()).toContainText('18:30');
  await expect(rows.first()).toContainText('+1.000.000.000.000');
  const more = panel.getByRole('button', { name: 'Xem thêm giao dịch' });
  await more.focus();
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(9);
  await expect(rows.nth(6)).toBeFocused();
  await expect(panel.getByRole('heading', { name: '25/11/2026' })).toBeVisible();
  await expect(more).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Tiền vào', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await panel.getByRole('button', { name: 'Bỏ lọc' }).click();
  await expect(rows).toHaveCount(6);
  await panel.getByRole('link', { name: 'Xem tất cả' }).click();
  await expect(page).toHaveURL(/\/app\/transactions$/);
});
