import { expect, test } from '@playwright/test';
import type { Loan } from '../../frontend/src/services/loansApi';

test('opens the loan journal from the dock and records partial and full payments', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const loans: Loan[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions: [] } });
    if (path === '/api/wallets') return route.fulfill({ json: { wallets: [] } });
    if (path === '/api/loans' && request.method() === 'POST') {
      const loan = { ...request.postDataJSON(), payments: [] } as Loan;
      loans.push(loan);
      return route.fulfill({ status: 201, json: { loan } });
    }
    if (path === '/api/loans') return route.fulfill({ json: { loans } });
    if (path.endsWith('/payments')) {
      const loan = loans.find(entry => path.includes(entry.id))!;
      loan.payments.unshift(request.postDataJSON());
      return route.fulfill({ status: 201, json: { loan } });
    }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app');
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Vay & cho mượn' }).click();
  await expect(page.getByRole('heading', { name: 'Vay & cho mượn' })).toBeVisible();
  await page.getByRole('button', { name: 'Ghi đi vay' }).click();
  const form = page.getByRole('dialog', { name: 'Đi vay' });
  await form.getByLabel('Vay từ ai?').fill('Chị Mai');
  await form.getByLabel('Số tiền gốc').fill('300000');
  await form.getByLabel('Ngày phát sinh').fill('2020-11-15');
  await form.getByLabel('Hạn trả (tùy chọn)').fill('2020-11-20');
  await form.getByRole('button', { name: 'Lưu khoản mới' }).click();

  const details = page.getByRole('dialog', { name: 'Chị Mai' });
  await expect(details).toContainText('300.000');
  await details.getByRole('button', { name: 'Ghi trả tiền' }).click();
  const payment = page.getByRole('dialog', { name: 'Ghi trả tiền' });
  await payment.getByLabel('Số tiền thanh toán').fill('100000');
  await payment.getByRole('button', { name: 'Lưu thanh toán' }).click();
  await expect(details.locator('.loans-detail-money strong')).toHaveText('200.000 ₫');
  await expect(details.getByRole('region', { name: 'Lịch sử thanh toán' })).toContainText('100.000');
  await details.getByRole('button', { name: 'Đóng' }).click();
  await page.getByRole('button', { name: /1 khoản đến hạn/ }).click();
  const row = page.locator('.loans-row').filter({ hasText: 'Chị Mai' });
  await expect(row).toContainText('Quá hạn');
  await row.click();
  await details.getByRole('button', { name: 'Ghi trả tiền' }).click();
  await payment.getByRole('button', { name: 'Điền toàn bộ số còn lại' }).click();
  await payment.getByRole('button', { name: 'Lưu thanh toán' }).click();
  await expect(details).toContainText('Đã hoàn tất');
  await details.getByRole('button', { name: 'Đóng' }).click();

  await expect(row).toHaveCount(0);
  await page.getByLabel('Trạng thái khoản vay').selectOption('done');
  await expect(row).toContainText('Đã tất toán');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Sổ ví' }).click();
  await expect(page.getByRole('heading', { name: 'Ví của tôi' })).toBeVisible();
});
