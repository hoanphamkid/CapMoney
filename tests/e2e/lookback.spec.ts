import { expect, test } from './fixtures';
import { readFile } from 'node:fs/promises';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

test('dims the screen once per photo change in the lookback reel', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-20T05:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-20T05:01:00Z'));
  const transactions = ['Bánh mì', 'Sữa'].map((note, index) => ({
    id: String(index + 1), note, type: 'expense', amount: 15000, amountMinor: 1500000, categoryId: 'food',
    walletId: 'wallet', dateKey: '2026-11-20', transactionTime: '10:00:00', source: 'manual', status: 'posted', imageUrl: null,
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions } });
    if (path === '/api/wallets') return route.fulfill({ json: { wallets: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app');
  await expect(page.locator('.cm-summary-cards')).toContainText('30.000');
  await page.getByRole('button', { name: 'Sau 1 ngày', exact: true }).click();
  const reel = page.locator('.cm-story-overlay');
  const fade = reel.locator('.cm-story-photo-fade');
  const frame = reel.locator('.cm-swipe-hint');
  await expect(frame).toHaveText('Ảnh 1/2');
  await expect(fade).toHaveCount(0);
  await expect(reel.getByRole('button', { name: /Tự đổi FX|Lật 3D|Zoom Flash/ })).toHaveCount(0);
  await page.clock.runFor(3000);
  await expect(frame).toHaveText('Ảnh 1/2');
  await expect(fade).toHaveCount(0);

  await reel.getByRole('button', { name: 'Ảnh tiếp theo' }).click();
  await expect(frame).toHaveText('Ảnh 2/2');
  await expect(fade).toHaveCSS('animation-name', 'storyPhotoFade');
  await expect(fade).toHaveCSS('animation-iteration-count', '1');
  const manualFade = await fade.elementHandle();
  await reel.getByRole('button', { name: 'Ảnh 2', exact: true }).click();
  expect(await manualFade?.evaluate(element => element.isConnected)).toBe(true);

  await reel.getByRole('button', { name: 'Phát', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(frame).toHaveText('Ảnh 1/2');
  await expect(fade).toHaveCount(1);
  expect(await manualFade?.evaluate(element => element.isConnected)).toBe(false);
  await reel.getByRole('button', { name: 'Tạm dừng' }).click();
  await page.clock.runFor(3000);
  await expect(frame).toHaveText('Ảnh 1/2');
});

test('exports album photos at their original proportions with the selected border and effect', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone' });
  });
  const popups: string[] = [];
  await page.exposeFunction('recordPopup', (url: string) => { popups.push(url); });
  await page.addInitScript(() => {
    const recordPopup = (window as typeof window & { recordPopup: (url: string) => void }).recordPopup;
    window.open = (url) => { recordPopup(String(url)); return null; };
  });
  const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const transaction = { id: 'bill', note: 'Hóa đơn đã lưu', type: 'expense', amount: 15000, amountMinor: 1500000, categoryId: 'food', walletId: 'wallet', dateKey, source: 'manual', status: 'posted', imageUrl: '/api/transactions/bill/image' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'owner', name: 'An', email: 'owner@example.test' }, profile: {} } });
    if (path === '/api/transactions') return route.fulfill({ json: { transactions: [transaction] } });
    if (path === transaction.imageUrl) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="192"><rect width="96" height="192" fill="#b15540"/></svg>' });
    if (path === '/api/wallets') return route.fulfill({ json: { wallets: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/app');
  await page.getByRole('button', { name: 'Sau 1 ngày', exact: true }).click();
  await page.getByRole('button', { name: 'Photobooth', exact: true }).click();
  const booth = page.locator('.cm-photobooth-editor');
  const canvas = booth.getByRole('img', { name: 'Ảnh Photobooth xem trước' });
  const fileInput = booth.getByLabel('Ảnh Photobooth từ album');
  async function photo(name: string, width: number, height: number, color: string) {
    const encoded = await page.evaluate(({ width, height, color }) => {
      const image = document.createElement('canvas');
      image.width = width;
      image.height = height;
      const context = image.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      return image.toDataURL().split(',')[1];
    }, { width, height, color });
    return { name, mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') };
  }

  await fileInput.setInputFiles(await photo('Ngang.png', 360, 180, '#e72446'));
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width / element.height)).toBe(2);
  await expect(booth.getByRole('group', { name: 'Hiệu ứng viền' }).getByRole('button')).toHaveCount(7);
  await expect(booth.getByRole('group', { name: 'Bộ lọc ảnh' }).getByRole('button')).toHaveCount(7);
  await booth.getByRole('button', { name: 'Tim hồng' }).click();
  await booth.getByRole('button', { name: 'Đen trắng' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), booth.getByRole('button', { name: 'Tải PNG' }).click()]);
  const png = (await readFile((await download.path())!)).toString('base64');
  expect(popups).toHaveLength(0);
  const exported = await page.evaluate(async png => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const [r, g, b] = context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasHeart = false;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 237 && pixels[i + 1] === 126 && pixels[i + 2] === 171) { hasHeart = true; break; }
    }
    return { ratio: canvas.width / canvas.height, grayscale: r === g && g === b, hasHeart };
  }, png);
  expect(exported).toEqual({ ratio: 2, grayscale: true, hasHeart: true });

  await booth.getByRole('button', { name: 'Ảnh gốc', exact: true }).click();
  await fileInput.setInputFiles(await photo('Dọc.png', 120, 360, '#26af52'));
  await expect(canvas).toBeVisible();
  const imageRatios = await canvas.evaluate((element: HTMLCanvasElement) => {
    const { width, height } = element;
    const data = element.getContext('2d')!.getImageData(0, 0, width, height).data;
    return [[231, 36, 70], [38, 175, 82]].map(([r, g, b]) => {
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      return (right - left + 1) / (bottom - top + 1);
    });
  });
  expect(imageRatios[0]).toBeCloseTo(2, 2);
  expect(imageRatios[1]).toBeCloseTo(1 / 3, 2);
  await booth.getByRole('button', { name: 'Ngang 16:9' }).click();
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width / element.height)).toBeCloseTo(16 / 9, 3);
  await booth.getByRole('button', { name: 'Dọc 9:16' }).click();
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width / element.height)).toBeCloseTo(9 / 16, 3);
  await booth.getByRole('button', { name: 'Bỏ chọn' }).click();
  await booth.getByRole('button', { name: 'Tỷ lệ gốc' }).click();
  await booth.getByRole('button', { name: /Hóa đơn đã lưu/ }).click();
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width / element.height)).toBe(.5);
});
