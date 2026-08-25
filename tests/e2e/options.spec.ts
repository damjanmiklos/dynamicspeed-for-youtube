import { test, expect, expectNoExtensionFailures } from './fixtures';

test.describe('options page', () => {
  test('renders settings and stays quiet in the console', async ({
    page,
    extensionId,
    extensionLogs,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByText('DynamicSpeed', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
    await expect(page.locator('div.text-sm.font-medium').filter({ hasText: /^Target WPM$/ })).toBeVisible();
    await expect(page.getByText('Temporarily turn on captions to load')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Report a bug' })).toBeVisible();
    await page.getByRole('button', { name: 'Pacing engine' }).click();
    await expect(page.getByRole('heading', { name: 'Pacing engine' })).toBeVisible();
    expectNoExtensionFailures(extensionLogs, extensionId);
  });
});
