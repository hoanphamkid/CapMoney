import { expect, test } from './fixtures';
import type { Loan } from '../../frontend/src/services/loansApi';

test('shows days until repayment and days overdue on a recorded loan', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.clock.setFixedTime(new Date('2026-11-26T17:05:00Z'));
  const loans: Loan[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/loans' && request.method() === 'POST') {
      const loan = { ...request.postDataJSON(), payments: [] } as Loan;
      loans.push(loan);
      return route.fulfill({ status: 201, json: { loan } });
    }
    if (path === '/api/loans') return route.fulfill({ json: { loans } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app/loans');
  await page.getByRole('button', { name: 'Ghi cho mượn' }).click();
  const form = page.getByRole('dialog', { name: 'Cho mượn' });
  await form.getByLabel('Cho ai mượn?').fill('Bạn Lan');
  await form.getByLabel('Số tiền gốc').fill('150000');
  await expect(form.getByLabel('Ngày phát sinh')).toHaveValue('2026-11-27');
  await form.getByLabel('Hạn trả (tùy chọn)').fill('2026-11-28');
  await form.getByRole('button', { name: 'Lưu khoản mới' }).click();

  const details = page.getByRole('dialog', { name: 'Bạn Lan' });
  const row = page.getByRole('button', { name: /Bạn Lan/ });
  const countdown = 'Còn 1 ngày đến hạn (28/11/2026)';
  await expect(details).toContainText(countdown);
  await details.getByRole('button', { name: 'Đóng' }).click();
  await expect(row).toContainText(countdown);

  await page.clock.setFixedTime(new Date('2026-11-27T17:05:00Z'));
  await page.reload();
  await expect(row).toContainText('Đến hạn hôm nay');

  await page.clock.setFixedTime(new Date('2026-11-30T17:05:00Z'));
  await page.reload();
  const overdue = 'Quá hạn 3 ngày (28/11/2026)';
  await expect(row).toContainText(overdue);
  await row.click();
  await expect(details).toContainText(overdue);
});

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

test('adds multiple loan photos at once and can reopen and remove them', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const loan: Loan = {
    id: 'loan', kind: 'lend', person: 'Bạn Minh', amount: 200000, openedOn: '2026-01-01', dueOn: null,
    note: '', payments: [], photos: [],
  };
  const images = new Map<string, string>();
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/loans') return route.fulfill({ json: { loans: [loan] } });
    if (path === '/api/loans/loan/photos' && request.method() === 'POST') {
      const { id, jpeg } = request.postDataJSON();
      images.set(id, jpeg);
      loan.photos!.push({ id, url: path + '/' + id });
      return route.fulfill({ status: 201, json: { loan } });
    }
    if (path.startsWith('/api/loans/loan/photos/')) {
      const id = path.split('/').pop()!;
      if (request.method() === 'DELETE') {
        loan.photos = loan.photos!.filter(photo => photo.id !== id);
        images.delete(id);
        return route.fulfill({ json: { loan } });
      }
      const jpeg = images.get(id);
      if (jpeg) return route.fulfill({ contentType: 'image/jpeg', body: Buffer.from(jpeg, 'base64') });
    }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app/loans');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#673ab7';
    ctx.fillRect(0, 0, 50, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const row = page.getByRole('button', { name: /Bạn Minh/ });
  await row.click();
  const details = page.getByRole('dialog', { name: 'Bạn Minh' });
  await details.getByRole('button', { name: 'Sửa thông tin' }).click();
  const form = page.getByRole('dialog', { name: 'Sửa khoản vay/mượn' });
  const gallery = form.getByRole('region', { name: 'Ảnh đính kèm' });
  await gallery.getByLabel('Chọn nhiều ảnh đính kèm').setInputFiles(['biên nhận', 'giấy vay'].map(name => ({
    name: name + '.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
  })));
  await expect(gallery.getByRole('status')).toHaveText('Đã thêm 2 ảnh.');
  await expect(gallery.getByRole('button', { name: /^Xem ảnh/ })).toHaveCount(2);

  await form.getByRole('button', { name: 'Đóng' }).click();
  await page.reload();
  await row.click();
  await page.getByRole('dialog', { name: 'Bạn Minh' }).getByRole('button', { name: 'Sửa thông tin' }).click();
  const reopenedForm = page.getByRole('dialog', { name: 'Sửa khoản vay/mượn' });
  const reopenedGallery = reopenedForm.getByRole('region', { name: 'Ảnh đính kèm' });
  await reopenedGallery.getByRole('button', { name: 'Xem ảnh 2' }).click();
  const image = reopenedGallery.getByRole('img', { name: 'Ảnh đính kèm 2' });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(80);
  await reopenedGallery.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
  await reopenedGallery.getByRole('button', { name: 'Xác nhận xóa ảnh' }).click();
  await expect(reopenedGallery.getByRole('button', { name: /^Xem ảnh/ })).toHaveCount(1);
});
