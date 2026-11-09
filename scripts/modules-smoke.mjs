import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Acer/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5173/register', { waitUntil: 'networkidle' });
await page.getByPlaceholder('Nguyễn Minh Anh').fill('Module Tester');
await page.getByPlaceholder('ban@email.com').fill(`modules-${Date.now()}@example.test`);
await page.locator('input[autocomplete="new-password"]').first().fill('CapMoney-test-123');
await page.locator('input[autocomplete="new-password"]').nth(1).fill('CapMoney-test-123');
await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
await page.waitForURL('**/app', { timeout: 15000 });

await page.goto('http://127.0.0.1:5173/app/calendar', { waitUntil: 'networkidle' });
const weekdayCount = await page.locator('.weekday-row span').count();
if (weekdayCount !== 7) throw new Error(`Expected 7 weekday headers, got ${weekdayCount}`);
await page.goto('http://127.0.0.1:5173/app/wallets', { waitUntil: 'networkidle' });
await page.locator('h1').filter({ hasText: 'Ví tiền' }).waitFor();
await page.screenshot({ path: '.local/wallets.png', fullPage: true });
await page.goto('http://127.0.0.1:5173/app/transactions', { waitUntil: 'networkidle' });
await page.locator('h1').filter({ hasText: 'Giao dịch' }).waitFor();
await page.screenshot({ path: '.local/transactions.png', fullPage: true });
await page.goto('http://127.0.0.1:5173/app/settings', { waitUntil: 'networkidle' });
await page.locator('h1').filter({ hasText: 'Cài đặt' }).waitFor();
await page.screenshot({ path: '.local/settings.png', fullPage: true });
console.log(`modules smoke ok; weekday headers: ${weekdayCount}`);
await browser.close();
