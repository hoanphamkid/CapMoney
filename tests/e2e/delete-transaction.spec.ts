import { expect, test, type Page } from '@playwright/test';

const transaction = {
  id: '507f1f77bcf86cd799439011', type: 'expense', amount: 3000, amountMinor: 300000,
  note: 'Khoản chi cần xóa', categoryId: 'food', walletId: '507f1f77bcf86cd799439012',
  dateKey: '2026-11-13', transactionTime: '09:27:00', source: 'manual', status: 'posted', imageUrl: null,
};

async function openTransaction(page: Page, mode: 'success' | 'error' | 'expired' | 'logged-out' = 'success') {
  let deletes = 0;
  let refreshes = 0;
  let deleted = false;
  await page.addInitScript(() => { window.confirm = () => false; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      await route.fulfill({ json: { user: { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'user' }, profile: {} } });
    } else if (path === '/api/auth/refresh') {
      refreshes++;
      await route.fulfill(mode === 'logged-out'
        ? { status: 401, json: { error: { code: 'SESSION_INVALID', message: 'Phiên đăng nhập không còn hợp lệ' } } }
        : { json: { user: { id: 'owner' } } });
    } else if (path === '/api/transactions') {
      await route.fulfill({ json: { transactions: deleted ? [] : [transaction] } });
    } else if (path === '/api/wallets') {
      await route.fulfill({ json: { wallets: [{ id: transaction.walletId, name: 'Wallet', type: 'cash', balance: 100000, balanceMinor: 10000000, currency: 'VND', color: '#163e36' }] } });
    } else if (path === `/api/transactions/${transaction.id}` && route.request().method() === 'DELETE') {
      deletes++;
      if ((mode === 'expired' && deletes === 1) || mode === 'logged-out') {
        await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập' } } });
      } else if (mode === 'error') {
        await route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'Không thể xóa giao dịch lúc này.' } } });
      } else {
        deleted = true;
        await route.fulfill({ status: 204 });
      }
    } else {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } });
    }
  });
  await page.goto('/app/transactions');
  await page.getByRole('button', { name: /Khoản chi cần xóa/ }).click();
  return { deletes: () => deletes, refreshes: () => refreshes };
}

test('deletes only after in-app confirmation when browser dialogs are blocked', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await openTransaction(page);
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Xóa giao dịch này?' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Hủy' })).toBeFocused();
  expect(calls.deletes()).toBe(0);
  await confirmation.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(page.locator('.expense-detail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Khoản chi cần xóa/ })).toHaveCount(0);
  expect(calls.deletes()).toBe(1);
});

test('cancel and Escape keep the transaction without sending a delete request', async ({ page }) => {
  const calls = await openTransaction(page);
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.expense-detail')).toBeVisible();
  expect(calls.deletes()).toBe(0);
});

test('shows delete errors and allows another attempt', async ({ page }) => {
  const calls = await openTransaction(page, 'error');
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(page.getByRole('alert')).toHaveText('Không thể xóa giao dịch lúc này.');
  await expect(page.getByRole('button', { name: 'Xác nhận xóa' })).toBeEnabled();
  await expect(page.locator('.expense-detail')).toBeVisible();
  expect(calls.deletes()).toBe(1);
});

test('refreshes an expired access session and retries deletion once', async ({ page }) => {
  const calls = await openTransaction(page, 'expired');
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(page.locator('.expense-detail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Khoản chi cần xóa/ })).toHaveCount(0);
  expect(calls.refreshes()).toBe(1);
  expect(calls.deletes()).toBe(2);
});

test('asks the user to sign in when the session cannot be refreshed', async ({ page }) => {
  const calls = await openTransaction(page, 'logged-out');
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(page.getByRole('alert')).toContainText('Vui lòng đăng nhập lại');
  await expect(page.locator('.expense-detail')).toBeVisible();
  expect(calls.refreshes()).toBe(1);
  expect(calls.deletes()).toBe(1);
});
