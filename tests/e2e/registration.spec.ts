import { expect, test } from './fixtures';

test('shows a registration error for an existing email and confirms a new account after redirect', async ({ page }) => {
  const successMessage = 'Tạo tài khoản thành công.';
  const duplicateMessage = 'Email này đã được đăng ký';
  const email = 'new@example.test';
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/register') {
      if (route.request().postDataJSON().email !== email) {
        return route.fulfill({ status: 409, json: { error: { code: 'EMAIL_EXISTS', message: duplicateMessage } } });
      }
      return route.fulfill({ status: 201, json: { user: { id: 'new', name: 'Minh Anh', email }, message: successMessage } });
    }
    if (path.startsWith('/api/auth/')) {
      return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED' } } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/register');
  await page.getByLabel('Tên của bạn').fill('Minh Anh');
  await page.getByLabel('Email').fill('existing@example.test');
  await page.locator('input[autocomplete="new-password"]').first().fill('test-password');
  await page.getByLabel('Nhập lại mật khẩu').fill('test-password');
  const submit = page.getByRole('button', { name: 'Tạo tài khoản' });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText(duplicateMessage);
  await expect(page).toHaveURL(/\/register$/);

  await page.getByLabel('Email').fill(email);
  await submit.click();
  await expect(page).toHaveURL(/\/app$/);
  const confirmation = page.getByRole('status').filter({ hasText: successMessage });
  await expect(confirmation).toBeVisible();
  await page.getByRole('button', { name: 'Đóng thông báo tạo tài khoản' }).click();
  await expect(confirmation).toHaveCount(0);
});
