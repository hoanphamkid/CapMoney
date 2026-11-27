import { expect, test } from './fixtures';

test('applies a home theme on mobile and remembers it after reload', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    }
    if (path === '/api/transactions') return route.fulfill({ json: { transactions: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app');
  const home = page.locator('.cm-home-screen');
  const launcher = page.getByRole('button', { name: 'Chọn giao diện' });
  const dialog = page.getByRole('dialog', { name: 'Giao diện toàn ứng dụng' });
  const cat = page.getByRole('button', { name: /Mèo Ngủ/ });
  const classic = page.getByRole('button', { name: /Mặc định/ });

  await launcher.click();
  await expect(dialog.getByRole('group').getByRole('button')).toHaveCount(6);
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
