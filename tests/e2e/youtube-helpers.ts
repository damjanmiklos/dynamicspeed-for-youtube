import type { BrowserContext, Page } from '@playwright/test';

export const SPEECH_VIDEO = 'https://www.youtube.com/watch?v=UF8uR6Z6KLc';
export const SPEECH_VIDEO_B = 'https://www.youtube.com/watch?v=iG9CE55wbtY';

export async function seedYoutubeConsent(context: BrowserContext): Promise<void> {
  const cookie = {
    name: 'SOCS',
    value:
      'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjUwNzMwLjA1X3AwGgJlbiACGgYIgLCXswY',
    path: '/',
  } as const;
  await context.addCookies([
    { ...cookie, domain: '.youtube.com' },
    { ...cookie, domain: '.google.com' },
  ]);
}

export async function openWatchPage(page: Page, url: string): Promise<void> {
  await seedYoutubeConsent(page.context());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await dismissConsent(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await dismissConsent(page);
  await page.waitForURL(/youtube\.com\/(watch|shorts)/, { timeout: 30_000 });
  await ensurePlaying(page);
}

export async function dismissConsent(page: Page): Promise<void> {
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const clicked = await clickAcceptAll(page);
      const bannerVisible = await page
        .getByText('Before you continue to YouTube')
        .isVisible()
        .catch(() => false);
      if (!clicked && !bannerVisible) {
        return;
      }
      await page.waitForTimeout(clicked ? 1500 : 500);
    }
  } catch {
    // Navigation can detach the page while the consent dialog is closing.
  }
}

async function clickAcceptAll(page: Page): Promise<boolean> {
  try {
    const button = page.getByRole('button', { name: 'Accept all', exact: true }).last();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2_000, force: true });
      return true;
    }
    const text = page.getByText('Accept all', { exact: true }).last();
    if (await text.isVisible().catch(() => false)) {
      await text.click({ timeout: 2_000, force: true });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function ensurePlaying(page: Page): Promise<void> {
  const player = page.locator('#movie_player, ytd-player').first();
  await player.waitFor({ state: 'attached', timeout: 30_000 });
  await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>('video.html5-main-video, video');
    if (!video) {
      return;
    }
    video.muted = true;
    void video.play().catch(() => undefined);
  });
  const play = page.locator('button.ytp-play-button[aria-label^="Play"], button.ytp-large-play-button').first();
  if (await play.isVisible().catch(() => false)) {
    await play.click({ force: true }).catch(() => undefined);
  }
}

export async function youtubePlayerBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    const errorText = /Something went wrong|Playback ID|Error 15[0-9]/i.test(document.body.innerText);
    return errorText || !video || video.readyState < 2 || Boolean(video.error);
  });
}

export async function readChip(page: Page): Promise<{
  visible: boolean;
  label: string;
  title: string;
  inactive: boolean;
} | null> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.dynamicspeed-chip');
    if (!chip) {
      return null;
    }
    return {
      visible: chip.getClientRects().length > 0,
      label: chip.textContent?.trim() ?? '',
      title: chip.title,
      inactive: chip.dataset.dsInactive === 'true',
    };
  });
}

