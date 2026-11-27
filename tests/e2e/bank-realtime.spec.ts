import { expect, test, type Page } from './fixtures';

const user = { id: 'bank-owner', email: 'bank@example.test', name: 'Bank Owner', role: 'user' };
type BankTransaction = { id: string; type: string; amount: number; amountMinor: number; note: string; categoryId: string; walletId: string; dateKey: string; transactionTime: string; source: string; status: string; imageUrl: null };

async function fixture(page: Page) {
  await page.addInitScript(() => {
    const streams: EventTarget[] = [];
    (window as any).__bankStreams = streams;
    (window as any).EventSource = class extends EventTarget {
      closed = false;
      constructor() { super(); streams.push(this); }
      close() { this.closed = true; }
    };
  });
  const transactions: BankTransaction[] = [];
  const wallet = { id: 'bank-wallet', name: 'MB Bank', type: 'bank', balance: 100000, balanceMinor: 10000000, currency: 'VND', color: '#002D72' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') await route.fulfill({ json: { user, profile: {} } });
    else if (path === '/api/wallets') await route.fulfill({ json: { wallets: [wallet] } });
    else if (path === '/api/transactions') await route.fulfill({ json: { transactions } });
    else if (path === '/api/auth/sessions') await route.fulfill({ json: { sessions: [] } });
    else await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } });
  });
  return {
    add(type: 'income' | 'expense', amount: number) {
      const tx: BankTransaction = { id: `${type}-${transactions.length}`, type, amount, amountMinor: amount * 100, note: `MB Bank ${type}`, categoryId: 'bills', walletId: wallet.id, dateKey: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }), transactionTime: '12:00:00', source: 'webhook_mbbank', status: 'posted', imageUrl: null };
      transactions.unshift(tx);
      wallet.balance += type === 'income' ? amount : -amount;
      wallet.balanceMinor = wallet.balance * 100;
      return tx;
    },
  };
}

async function emit(page: Page, event: string, data = {}) {
  await page.evaluate(({ event, data }) => {
    const stream = (window as any).__bankStreams.filter((item: any) => !item.closed).at(-1);
    stream.dispatchEvent(new MessageEvent(event, { data: JSON.stringify(data) }));
  }, { event, data });
}

test('shows incoming/outgoing bank transactions and wallet balances without reloading', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/app/transactions');
  await expect(page.getByRole('button', { name: 'Chọn ví MB Bank' })).toContainText('100.000');
  const income = state.add('income', 50000);
  await emit(page, 'bank-transaction', income);
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Chọn ví MB Bank' })).toContainText('150.000');
  await expect(page.locator('.bank-notification-toast')).toContainText('Nhận tiền');
  await page.getByRole('button', { name: 'Đóng thông báo' }).click();
  await emit(page, 'bank-transaction', income);
  await expect(page.locator('.bank-notification-toast')).toHaveCount(0);
  await emit(page, 'bank-transaction', state.add('expense', 20000));
  await expect(page.locator('.ledger-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Chọn ví MB Bank' })).toContainText('130.000');
  await expect(page.locator('.bank-notification-toast')).toContainText('Chuyển tiền');
});

test('catches up after reconnecting without notifying about old transactions', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/app/transactions');
  await expect(page.getByRole('button', { name: 'Chọn ví MB Bank' })).toBeVisible();
  state.add('expense', 30000);
  await emit(page, 'ready');
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Chọn ví MB Bank' })).toContainText('70.000');
  await expect(page.locator('.bank-notification-toast')).toHaveCount(0);
});

test('refreshes statistics when a bank event arrives', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/app/dashboard');
  await expect(page.getByRole('heading', { name: 'Thống kê', exact: true })).toBeVisible();
  await emit(page, 'bank-transaction', state.add('income', 45000));
  await expect(page.locator('.cm-recent-row')).toContainText('MB Bank income');
});

test('refreshes the calendar when a bank event arrives', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/app');
  await expect(page.locator('.cm-days-grid')).toBeVisible();
  await expect(page.locator('.cm-day-slot.has-events')).toHaveCount(0);
  await emit(page, 'bank-transaction', state.add('expense', 15000));
  await expect(page.locator('.cm-day-slot.has-events')).toHaveCount(1);
  await expect(page.locator('.cm-summary-cards')).toContainText('15.000');
});

test('provides a bank push toggle and explains missing server configuration', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PushManager', { value: class {} });
    Object.defineProperty(window, 'Notification', { value: { permission: 'default', requestPermission: async () => 'granted' } });
  });
  await page.route('**/api/notifications/config', route => route.fulfill({ json: { enabled: false, publicKey: null } }));
  await page.goto('/app/settings');
  await page.getByRole('link', { name: /Thông báo/ }).click();
  const toggle = page.getByRole('switch', { name: 'Thông báo tiền vào và tiền ra MB Bank' });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.getByText('Máy chủ chưa cấu hình thông báo đẩy. Cần thêm bộ khóa VAPID rồi triển khai lại.')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});
