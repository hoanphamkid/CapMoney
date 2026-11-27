import { test as base } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

export const test = base.extend<{ dismissWelcome: void }>({
  dismissWelcome: [async ({ page }, use) => {
    const welcome = page.getByRole('dialog', { name: 'Chào mừng đến với CapMoney' });
    await page.addLocatorHandler(welcome, dialog => dialog.getByRole('button', { name: 'Vào CapMoney' }).click());
    await use();
  }, { auto: true }],
});
