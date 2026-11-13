import { expect, test, type Page } from '@playwright/test';

const cashId = '507f1f77bcf86cd799439012';
const bankId = '507f1f77bcf86cd799439013';
async function openWorkspace(page: Page) {
  const wallets = [
    { id: cashId, name: 'Tiền mặt', type: 'cash', balance: 100000, balanceMinor: 10000000, currency: 'VND', color: '#163e36' },
    { id: bankId, name: 'MB Bank', type: 'bank', balance: 1200000, balanceMinor: 120000000, currency: 'VND', color: '#3c6684' },
  ];
  const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#6ea2dc"/></svg>')}`;
  const rows = [
    { id: 'coffee', type: 'expense', amount: 30000, note: 'Cà phê sáng', categoryId: 'food', walletId: cashId, toWalletId: '', imageUrl: null as string | null },
    { id: 'salary', type: 'income', amount: 1000000, note: 'Lương tuần', categoryId: 'salary', walletId: bankId, toWalletId: '', imageUrl: photo },
    { id: 'other', type: 'expense', amount: 80000, note: 'Momo', categoryId: 'other', walletId: bankId, toWalletId: '', imageUrl: null },
    { id: 'transfer', type: 'transfer', amount: 10000, note: 'Nạp tài khoản', categoryId: 'transfer', walletId: cashId, toWalletId: bankId, imageUrl: null },
  ].map((row, index) => ({ ...row, amountMinor: row.amount * 100, dateKey: '2026-11-13', transactionTime: `09:${String(index * 10).padStart(2, '0')}:00`, source: 'manual', status: 'posted' }));
  let transfers = 0;
  let walletCreates = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', email: 'owner@example.test', name: 'Minh Anh', role: 'user' }, profile: {} } });
    if (path === '/api/wallets') {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON(); walletCreates++;
        const wallet = { ...input, id: `new-${walletCreates}`, balance: input.openingBalance, balanceMinor: input.openingBalance * 100, currency: 'VND' };
        wallets.push(wallet); return route.fulfill({ status: 201, json: { wallet } });
      }
      return route.fulfill({ json: { wallets } });
    }
    if (path === '/api/transactions') {
      if (route.request().method() === 'POST') {
        const body = route.request().postData() ?? '';
        const field = (name: string) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? '';
        const amount = Number(field('amount'));
        const source = wallets.find(wallet => wallet.id === field('walletId'))!;
        const destination = wallets.find(wallet => wallet.id === field('toWalletId'))!;
        transfers++;
        source.balance -= amount; destination.balance += amount;
        const transaction = { id: `transfer-${transfers}`, type: 'transfer', amount, amountMinor: amount * 100, note: field('note'), categoryId: 'transfer', walletId: source.id, toWalletId: destination.id, dateKey: '2026-11-13', transactionTime: '12:00:00', source: 'manual', status: 'posted', imageUrl: null };
        rows.push(transaction); return route.fulfill({ status: 201, json: { transaction } });
      }
      return route.fulfill({ json: { transactions: rows } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } });
  });
  await page.goto('/app/transactions');
  await expect(page.locator('.money-wallet-card')).toHaveCount(2);
  await expect(page.locator('.ledger-row')).toHaveCount(4);
  return { wallets, transfers: () => transfers, walletCreates: () => walletCreates };
}

test('filters each wallet and finds incomplete receipts without a monthly statistics summary', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator('.ledger-summary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chọn ví MB Bank', exact: true }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(3);
  await page.getByRole('button', { name: /Thiếu ảnh/ }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.locator('.ledger-row')).toContainText('Momo');
  await page.getByRole('button', { name: /Chưa phân loại/ }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tất cả ví', exact: true }).click();
  await page.getByLabel('Tìm giao dịch').fill('ca phe');
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.locator('.ledger-row')).toContainText('Cà phê sáng');
});

test('creates a wallet with an opening balance without changing the existing wallets', async ({ page }) => {
  const state = await openWorkspace(page);
  await page.getByRole('button', { name: 'Thêm ví', exact: true }).click();
  await page.getByLabel('Tên ví', { exact: true }).fill('Tiết kiệm');
  await page.getByRole('combobox', { name: 'Loại ví', exact: true }).selectOption('savings');
  await page.getByLabel('Số dư ban đầu').fill('500000');
  await page.getByRole('button', { name: 'Tạo ví', exact: true }).click();
  await expect(page.locator('.money-wallet-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Chọn ví Tiết kiệm' })).toContainText('500.000');
  expect(state.walletCreates()).toBe(1);
  expect(state.wallets.slice(0, 2).map(wallet => wallet.balance)).toEqual([100000, 1200000]);
});

test('opens income capture with the selected wallet already chosen', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Chọn ví MB Bank', exact: true }).click();
  await page.locator('.money-action.income').click();
  await page.locator('.cm-skip-camera').click();
  await expect(page.locator('.cm-select-pill select').nth(1)).toHaveValue(bankId);
  await expect(page.getByRole('button', { name: 'Khoản thu', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('transfers between selected wallets and refreshes their balances', async ({ page }) => {
  const state = await openWorkspace(page);
  await page.getByRole('button', { name: 'Chọn ví MB Bank', exact: true }).click();
  await page.getByRole('button', { name: /Chuyển ví Giữa hai ví/ }).click();
  await expect(page.getByRole('combobox', { name: 'Từ ví', exact: true })).toHaveValue(bankId);
  await expect(page.getByRole('combobox', { name: 'Đến ví', exact: true })).toHaveValue(cashId);
  await page.getByLabel('Số tiền chuyển').fill('25000');
  await page.getByLabel('Ghi chú chuyển tiền').fill('Rút tiền mặt');
  await page.getByRole('button', { name: 'Xác nhận chuyển tiền' }).click();
  await expect(page.locator('.money-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chọn ví MB Bank', exact: true })).toContainText('1.175.000');
  await expect(page.getByRole('button', { name: 'Chọn ví Tiền mặt', exact: true })).toContainText('125.000');
  expect(state.transfers()).toBe(1);
  await page.locator('.ledger-row').filter({ hasText: 'Rút tiền mặt' }).click();
  await expect(page.locator('.expense-detail .detail-kind')).toHaveText('Chuyển ví');
  await expect(page.getByRole('button', { name: 'Sửa chi tiết' })).toHaveCount(0);
  await expect(page.locator('.detail-meta')).toContainText('Từ ví: MB Bank');
  await expect(page.locator('.detail-meta')).toContainText('Đến ví: Tiền mặt');
});

test('rejects a transfer larger than the source balance before submitting', async ({ page }) => {
  const state = await openWorkspace(page);
  await page.getByRole('button', { name: /Chuyển ví Giữa hai ví/ }).click();
  await page.getByLabel('Số tiền chuyển').fill('999999999');
  await page.getByRole('button', { name: 'Xác nhận chuyển tiền' }).click();
  await expect(page.getByRole('alert')).toContainText('Số dư ví nguồn không đủ');
  expect(state.transfers()).toBe(0);
});

for (const width of [320, 390]) {
  test(`wallet controls fit a ${width}px mobile screen`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    await expect(page.getByLabel('Loại giao dịch')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Ẩn số dư', exact: true }).click();
    await expect(page.locator('.money-wallet-card strong').first()).toHaveText('••••••');
    await page.getByRole('button', { name: 'Hiện số dư', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath('wallet-workspace.png'), fullPage: true });
  });
}
