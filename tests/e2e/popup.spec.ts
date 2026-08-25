import { test, expect, expectNoExtensionFailures } from './fixtures';

test.describe('popup', () => {
  test('renders and stays quiet in the console', async ({ page, extensionId, extensionLogs }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByText('for YouTube')).toBeVisible();
    await expect(page.getByText('Open a YouTube video to use DynamicSpeed.')).toBeVisible();
    await expect(page.getByText('Target WPM')).toBeVisible();
    await expect(page.getByRole('switch')).toBeVisible();
    expectNoExtensionFailures(extensionLogs, extensionId);
  });
});
