import { expect, test, type Page } from './fixtures';

async function mockAppearanceAccount(page: Page) {
  const transaction = { id: 'receipt', type: 'expense', note: 'Cà phê', amount: 50000, categoryId: 'food', walletId: 'wallet', dateKey: '2026-11-28', source: 'manual' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    }
    if (path === '/api/transactions') return route.fulfill({ json: { transactions: [transaction] } });
    if (path === '/api/wallets') return route.fulfill({ json: { wallets: [{ id: 'wallet', name: 'Tiền mặt', balance: 100000, type: 'cash', color: '#30415a' }] } });
    if (path === '/api/loans') return route.fulfill({ json: { loans: [] } });
    return route.fulfill({ status: 404, json: {} });
  });
}

test('applies a home theme on mobile and remembers it after reload', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await mockAppearanceAccount(page);

  await page.goto('/app');
  const home = page.locator('.cm-home-screen');
  const launcher = page.getByRole('button', { name: 'Chọn giao diện' });
  const dialog = page.getByRole('dialog', { name: 'Giao diện toàn ứng dụng' });
  const cat = page.getByRole('button', { name: /Mèo Ngủ/ });
  const classic = page.getByRole('button', { name: /Mặc định/ });

  await launcher.click();
  await expect(dialog.getByRole('group', { name: 'Các mẫu giao diện' }).getByRole('button')).toHaveCount(12);
  await expect(classic).toHaveAttribute('aria-pressed', 'true');
  await cat.click();
  await expect(cat).toHaveAttribute('aria-pressed', 'true');
  await expect(home.locator('.cm-calendar-board')).toHaveCSS('background-color', 'rgb(255, 250, 243)');
  await expect(page.locator('.cm-bottom-dock')).toHaveCSS('background-color', 'rgb(255, 250, 243)');
  await expect(classic.locator('[data-theme-sample]')).toHaveCSS('color', 'rgb(145, 187, 255)');
  await dialog.getByRole('button', { name: 'Xong' }).click();
  await expect(launcher).toBeFocused();
  await expect.poll(() => home.locator('.cm-home-theme-cat').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.cm-toolbar-row')).toBeInViewport({ ratio: 1 });
  await expect(launcher).toBeInViewport({ ratio: 1 });

  await page.goto('/app/settings');
  await expect(page.locator('.cm-app-shell')).toHaveAttribute('data-app-theme', 'sleepy-cat');
  const profileLink = page.getByRole('link', { name: /Chỉnh sửa hồ sơ/ });
  await expect(profileLink).toHaveCSS('background-color', 'rgb(149, 78, 50)');
  await expect(page.locator('.cm-settings-list').first()).toHaveCSS('background-color', 'rgb(255, 250, 243)');
  await expect(page.getByLabel('Họ tên')).toHaveCount(0);
  await expect(page.getByLabel('Mật khẩu mới')).toHaveCount(0);
  await profileLink.click();
  await expect(page.getByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeFocused();
  await expect(page.getByLabel('Họ tên')).toHaveCSS('background-color', 'rgb(246, 225, 204)');
  await expect(page.getByRole('button', { name: 'Lưu hồ sơ' })).toHaveCSS('background-color', 'rgb(149, 78, 50)');
  await page.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
  await expect(profileLink).toBeVisible();
  await expect(page.getByLabel('Họ tên')).toHaveCount(0);
  const settingsFit = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await settingsFit()).toBe(true);
  await page.setViewportSize({ width: 1024, height: 820 });
  expect(await settingsFit()).toBe(true);
  await page.setViewportSize({ width: 320, height: 650 });
  await page.goto('/app/dashboard');
  await expect(page.locator('.metric-card').first()).toHaveCSS('background-color', 'rgb(255, 250, 243)');
  await expect(page.locator('.cm-report').first()).toHaveCSS('background-color', 'rgb(255, 250, 243)');
  await expect(page.locator('.cm-report-flow-filter').first()).toHaveCSS('background-color', 'rgb(246, 225, 204)');
  await page.goto('/app');

  await page.reload();
  await expect(home).toHaveAttribute('data-home-theme', 'sleepy-cat');
  await launcher.click();
  await expect(cat).toHaveAttribute('aria-pressed', 'true');
  await classic.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(home).toHaveAttribute('data-home-theme', 'classic');
});

test('uses the selected light or dark mode across routes and dialogs', async ({ page }) => {
  await mockAppearanceAccount(page);
  await page.goto('/app/settings?section=appearance');
  const mode = page.getByRole('group', { name: 'Chế độ hiển thị' });
  await mode.getByRole('button', { name: 'Sáng' }).click();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  const lightPanel = await page.locator('.cm-settings-detail').first().evaluate(element => getComputedStyle(element).backgroundColor);
  expect(lightPanel).not.toBe('rgb(23, 24, 29)');

  await page.goto('/app/transactions');
  await expect(page.locator('.money-page')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('.money-wallet-card')).toHaveCSS('background-color', lightPanel);
  await page.locator('.ledger-row').filter({ hasText: 'Cà phê' }).click();
  await expect(page.locator('.expense-detail')).toHaveCSS('background-color', lightPanel);
  await page.locator('.expense-detail').getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi', exact: true }).click();
  await page.locator('.cm-skip-camera').click();
  await expect(page.locator('.cm-capture-modal')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('.cm-photo-stage')).toHaveCSS('background-color', lightPanel);
  await expect(page.getByRole('combobox', { name: 'Ví giao dịch' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.goto('/app/sync');
  await expect(page.locator('.cm-sync-intro')).toHaveCSS('background-color', lightPanel);

  await page.goto('/app');
  await page.getByRole('button', { name: 'Chọn giao diện' }).click();
  const picker = page.getByRole('dialog', { name: 'Giao diện toàn ứng dụng' });
  await picker.getByRole('button', { name: 'Đại Dương' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'light');
  await picker.getByRole('button', { name: 'Tối', exact: true }).click();
  await picker.getByRole('button', { name: 'Xong' }).click();
  await expect(page.locator('.cm-app-shell')).toHaveAttribute('data-app-theme', 'ocean');
  await page.goto('/app/loans');
  await expect(page.locator('.loans-page')).toHaveCSS('color-scheme', 'dark');
  await page.goto('/app/dashboard');
  await expect(page.locator('.dashboard-page')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('.metric-card').first()).not.toHaveCSS('background-color', lightPanel);
  await page.goto('/app/settings?section=appearance');
  await expect(mode.getByRole('button', { name: 'Tối', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Chủ đề màu và ảnh nền/ })).toContainText('Đại Dương');
});

test('previews, saves and removes a filtered wallpaper from the photo album', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAppearanceAccount(page);
  await page.goto('/app/settings?section=appearance');
  const launcher = page.getByRole('button', { name: /Chủ đề màu và ảnh nền/ });
  const picker = page.getByRole('dialog', { name: 'Giao diện toàn ứng dụng' });
  await launcher.click();
  await picker.getByRole('button', { name: 'Ảnh nền', exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 240;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#3964b7';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await picker.getByLabel('Tệp ảnh nền').setInputFiles({ name: 'album.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const filters = picker.getByRole('group', { name: 'Bộ lọc ảnh nền' });
  await expect(filters.getByRole('button')).toHaveCount(7);
  await filters.getByRole('button', { name: 'Đen trắng' }).click();
  await expect(picker.getByAltText('Xem trước ảnh nền')).toHaveCSS('filter', 'grayscale(1)');
  const wallpaper = page.locator('.cm-app-wallpaper img');
  await expect(wallpaper).toHaveCount(0);
  await picker.getByRole('button', { name: 'Áp dụng ảnh nền' }).click();
  await expect(picker.getByRole('status')).toHaveText('Đã áp dụng ảnh nền.');
  await picker.getByRole('button', { name: 'Xong' }).click();
  await expect(wallpaper).toHaveCSS('filter', 'grayscale(1)');
  await page.reload();
  await expect(wallpaper).toHaveCSS('filter', 'grayscale(1)');
  await page.getByRole('group', { name: 'Chế độ hiển thị' }).getByRole('button', { name: 'Sáng' }).click();
  await expect(wallpaper).toHaveCSS('filter', 'grayscale(1)');
  await launcher.click();
  await picker.getByRole('button', { name: 'Ảnh nền', exact: true }).click();
  await expect(filters.getByRole('button', { name: 'Đen trắng' })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Gỡ ảnh nền' }).click();
  await expect(picker.getByRole('status')).toHaveText('Đã gỡ ảnh nền.');
  await expect(wallpaper).toHaveCount(0);
});
