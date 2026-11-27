import { expect, test } from './fixtures';

test('saves an avatar and unlocks Pro tools only after payment confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const user = { id: 'owner', name: 'Hoan', email: 'owner@example.test', phone: '', proEnabled: false };
  const profile = { locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', avatarUrl: undefined as string | undefined };
  const order = { code: 'CPPROABCDEF0123456789', amount: 5000, bankName: 'MB Bank', accountNumber: '00424242', accountName: 'CAPMONEY TEST' };
  let orderCreated = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      if (route.request().method() === 'PATCH') {
        const input = route.request().postDataJSON();
        if ('avatarUrl' in input) profile.avatarUrl = input.avatarUrl ?? undefined;
      }
      return route.fulfill({ json: { user, profile } });
    }
    if (path === '/api/auth/pro') {
      if (user.proEnabled) return route.fulfill({ json: { status: 'paid' } });
      if (route.request().method() === 'POST') orderCreated = true;
      return route.fulfill({ json: orderCreated ? { status: 'pending', order } : { status: 'available', price: 5000 } });
    }
    if (path === '/api/auth/sessions') return route.fulfill({ json: { sessions: [] } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app/settings?section=profile');
  await expect(page.getByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#68439c';
    context.fillRect(0, 0, 120, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Tệp ảnh đại diện').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.cm-profile-avatar img')).toHaveJSProperty('naturalWidth', 256);
  await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu hồ sơ.');
  expect(profile.avatarUrl).toMatch(/^data:image\/jpeg;base64,/);

  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click();
  await expect(page.locator('.cm-home-avatar img')).toHaveJSProperty('naturalWidth', 256);
  const toolkit = page.getByRole('dialog', { name: 'Siêu tiện ích tài chính' });
  await page.locator('.cm-toolkit-launch').click();
  await toolkit.getByRole('tab', { name: 'Kế hoạch tuần (Pro)' }).click();
  await expect(toolkit.getByRole('link', { name: 'Mở khóa Pro' })).toBeVisible();
  await expect(toolkit.getByText('Đã chi tuần này')).toHaveCount(0);
  await toolkit.getByRole('tab', { name: 'Chia bill (Pro)' }).click();
  await expect(toolkit.getByText('Tổng hóa đơn')).toHaveCount(0);
  await toolkit.getByRole('link', { name: 'Mở khóa Pro' }).click();
  await expect(page.getByRole('heading', { name: 'Mở khóa Pro để trải nghiệm tất cả' })).toBeVisible();
  await expect(page.locator('.cm-pro-price')).toContainText('5.000');
  await page.getByRole('button', { name: 'Thanh toán để mở khóa Pro' }).click();
  await expect(page.locator('.cm-pro-payment')).toContainText(order.code);
  await expect(page.locator('.cm-pro-payment')).toContainText('5.000');
  await page.getByRole('button', { name: 'Kiểm tra thanh toán' }).click();
  await expect(page.getByRole('status')).toContainText('Chưa nhận được xác nhận chuyển khoản.');
  await expect(page.getByRole('heading', { name: 'Bạn đã mở khóa Pro' })).toHaveCount(0);
  user.proEnabled = true;
  await page.getByRole('button', { name: 'Kiểm tra thanh toán' }).click();
  await expect(page.getByRole('heading', { name: 'Bạn đã mở khóa Pro' })).toBeVisible();
  await page.getByRole('link', { name: 'Về trang chủ' }).click();
  await page.reload();
  await page.locator('.cm-toolkit-launch').click();
  await toolkit.getByRole('tab', { name: 'Kế hoạch tuần', exact: true }).click();
  await expect(toolkit.getByText('Đã chi tuần này')).toBeVisible();
  await toolkit.getByRole('tab', { name: 'Chia bill', exact: true }).click();
  await expect(toolkit.getByText('Tổng hóa đơn')).toBeVisible();
  await toolkit.getByRole('button', { name: 'Đóng', exact: true }).click();

  await page.getByRole('button', { name: 'Tài khoản và cài đặt' }).click();
  await page.getByRole('link', { name: /Chỉnh sửa hồ sơ/ }).click();
  await expect(page.locator('.cm-profile-avatar img')).toBeVisible();
  await page.getByRole('button', { name: 'Gỡ ảnh' }).click();
  await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(page.locator('.cm-profile-avatar img')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Đã lưu hồ sơ.');
  expect(profile.avatarUrl).toBeUndefined();
  expect(user.proEnabled).toBe(true);
});
