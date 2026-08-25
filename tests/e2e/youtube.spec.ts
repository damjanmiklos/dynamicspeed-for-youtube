import { test, expect, expectNoExtensionFailures } from './fixtures';
import { openWatchPage, readChip, youtubePlayerBlocked, SPEECH_VIDEO } from './youtube-helpers';

const YOUTUBE_LIVE = process.env.CI !== 'true';

test.describe('YouTube watch page', () => {
  test.skip(!YOUTUBE_LIVE, 'Live YouTube smoke is local-only');

  test('injects the player chip and emits no extension errors', async ({
    page,
    extensionId,
    extensionLogs,
  }) => {
    test.setTimeout(120_000);
    await openWatchPage(page, SPEECH_VIDEO);

    await expect
      .poll(async () => Boolean(await readChip(page)), { timeout: 45_000 })
      .toBe(true);

    const chip = await readChip(page);
    expect(chip?.label).toMatch(/[\d.]+×|^—$/);

    expectNoExtensionFailures(extensionLogs, extensionId);
  });

  test('acquires captions when YouTube lets the video play', async ({ page, extensionId, extensionLogs }) => {
    test.setTimeout(180_000);
    await openWatchPage(page, SPEECH_VIDEO);
    await expect
      .poll(async () => Boolean(await readChip(page)), { timeout: 45_000 })
      .toBe(true);

    const deadline = Date.now() + 70_000;
    let title = '';
    let blocked = false;
    while (Date.now() < deadline) {
      blocked = await youtubePlayerBlocked(page);
      title = (await readChip(page))?.title ?? '';
      if (blocked || /Speech ~|Captions: ready/.test(title)) {
        break;
      }
      await page.waitForTimeout(1000);
    }
    test.skip(
      blocked,
      'YouTube blocked this automated Chromium session; caption acquire needs a real Chrome profile',
    );
    expect(title).toMatch(/Speech ~|Captions: ready/);

    expectNoExtensionFailures(extensionLogs, extensionId);
  });
});
