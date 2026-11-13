import { expect, test, type Page } from '@playwright/test';

const user = { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'user' };
const transaction = { id: '507f1f77bcf86cd799439011', type: 'expense', amount: 10000, amountMinor: 1000000, note: 'Hóa đơn', categoryId: 'bills', walletId: '507f1f77bcf86cd799439012', dateKey: '2026-11-13', transactionTime: '00:50:00', source: 'manual', status: 'posted', imageUrl: null };

async function fixture(page: Page, initiallyExpired = false) {
  let expired = initiallyExpired;
  let refreshes = 0;
  const uploads: string[] = [];
  const wallets = [
    { id: transaction.walletId, name: 'Wallet', type: 'cash', balance: 100000, balanceMinor: 10000000, currency: 'VND', color: '#163e36' },
    { id: '507f1f77bcf86cd799439013', name: 'Bank', type: 'bank', balance: 200000, balanceMinor: 20000000, currency: 'VND', color: '#3c6684' },
  ];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/refresh') {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 50));
      expired = false;
      await route.fulfill({ json: { user } });
    } else if (expired) {
      await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Phiên truy cập hết hạn' } } });
    } else if (path === '/api/auth/me') {
      await route.fulfill({ json: { user, profile: {} } });
    } else if (path === '/api/transactions') {
      await route.fulfill({ json: { transactions: [transaction] } });
    } else if (path === '/api/wallets') {
      await route.fulfill({ json: { wallets } });
    } else if (path.startsWith('/api/wallets/') && route.request().method() === 'PATCH') {
      const wallet = wallets.find(row => path.endsWith(row.id))!;
      Object.assign(wallet, route.request().postDataJSON());
      await route.fulfill({ json: { wallet } });
    } else if (path === `/api/transactions/${transaction.id}` && route.request().method() === 'PUT') {
      uploads.push(route.request().postData() ?? '');
      await route.fulfill({ json: { transaction } });
    } else {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } });
    }
  });
  return { expire: () => { expired = true; }, refreshes: () => refreshes, uploads, wallets };
}

test('restores the session when reopening the app after the access cookie expires', async ({ page }) => {
  const state = await fixture(page, true);
  await page.goto('/app/transactions');
  await expect(page.locator('.ledger-row')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/transactions$/);
  expect(state.refreshes()).toBe(1);
  await page.reload();
  await expect(page.locator('.ledger-row')).toBeVisible();
  expect(state.refreshes()).toBe(1);
});

test('shares one refresh across simultaneous protected requests', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/app/transactions');
  await expect(page.locator('.ledger-row')).toBeVisible();
  state.expire();
  const counts = await page.evaluate(async () => {
    const modulePath = '/src/services/api.ts';
    const { api } = await import(modulePath);
    const [wallets, transactions] = await Promise.all([api.wallets(), api.transactions()]);
    return [wallets.wallets.length, transactions.transactions.length];
  });
  expect(counts).toEqual([2, 1]);
  expect(state.refreshes()).toBe(1);
});

test('does not refresh or loop when a login password is incorrect', async ({ page }) => {
  const state = await fixture(page);
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { error: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng' } } }));
  await page.goto('/app/transactions');
  await expect(page.locator('.ledger-row')).toBeVisible();
  const code = await page.evaluate(async () => {
    const modulePath = '/src/services/api.ts';
    const { api } = await import(modulePath);
    try { await api.login({ email: 'wrong@example.test', password: 'wrong-password', remember: true }); }
    catch (error) { return (error as { code: string }).code; }
  });
  expect(code).toBe('INVALID_CREDENTIALS');
  expect(state.refreshes()).toBe(0);
});

test('chooses an album photo, changes the wallet, and saves after session expiry on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await page.goto('/app/transactions');
  await page.locator('.ledger-row').click();
  await page.getByRole('button', { name: 'Sửa chi tiết' }).click();
  await page.getByLabel('Ví của giao dịch').selectOption(state.wallets[1].id);
  const album = page.getByLabel('Chọn ảnh từ album');
  expect(await album.getAttribute('capture')).toBeNull();
  await expect(page.getByLabel('Chụp ảnh mới')).toHaveAttribute('capture', 'environment');
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e06d64'; context.fillRect(0, 0, 40, 30);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await album.setInputFiles({ name: 'album-receipt.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.locator('.cm-crop-submit-btn')).toBeVisible();
  await page.getByRole('button', { name: 'Dùng ảnh này' }).click();
  await expect(page.locator('.edit-thumb')).toBeVisible();
  state.expire();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.locator('.edit-transaction')).toHaveCount(0);
  expect(state.refreshes()).toBe(1);
  expect(state.uploads).toHaveLength(1);
  expect(state.uploads[0]).toContain(state.wallets[1].id);
  expect(state.uploads[0]).toContain('name="image"');
  expect(state.uploads[0]).toContain('image/jpeg');
  await expect(page).toHaveURL(/\/app\/transactions$/);
});

test('renames the selected wallet explicitly without saving the transaction', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/app/transactions');
  await page.locator('.ledger-row').click();
  await page.getByRole('button', { name: 'Sửa chi tiết' }).click();
  await page.getByLabel('Ví của giao dịch').selectOption(state.wallets[1].id);
  await page.getByRole('button', { name: 'Đổi tên ví' }).click();
  await page.getByLabel('Tên ví', { exact: true }).fill('MB Bank');
  await page.getByRole('button', { name: 'Lưu tên ví' }).click();
  await expect(page.getByLabel('Ví của giao dịch').locator('option:checked')).toHaveText('MB Bank');
  expect(state.uploads).toHaveLength(0);
  expect(state.wallets[1].type).toBe('bank');
});
