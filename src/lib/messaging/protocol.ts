export const RUNTIME_SOURCE = 'dynamicspeed-runtime';

export type PageState = {
  isYouTube: boolean;
  videoId: string | null;
  channelId: string | null;
  channelName: string | null;
  title: string | null;
  playbackRate: number | null;
  spokenWpm: number | null;
  hasTranscript: boolean;
  transcriptStatus: string;
  automationActive: boolean;
  blockReason: string | null;
  isShorts: boolean;
  isLive: boolean;
  isMusic: boolean;
};

export type RuntimeMessage =
  | { source: typeof RUNTIME_SOURCE; type: 'GET_PAGE_STATE' }
  | { source: typeof RUNTIME_SOURCE; type: 'PAGE_STATE'; state: PageState }
  | { source: typeof RUNTIME_SOURCE; type: 'TOGGLE_CHANNEL' }
  | { source: typeof RUNTIME_SOURCE; type: 'TOGGLE_VIDEO' }
  | { source: typeof RUNTIME_SOURCE; type: 'OPEN_OPTIONS' }
  | { source: typeof RUNTIME_SOURCE; type: 'COMMAND'; command: string }
  | { source: typeof RUNTIME_SOURCE; type: 'SETTINGS_CHANGED' };

export function isRuntimeMessage(data: unknown): data is RuntimeMessage {
  return Boolean(
    data &&
      typeof data === 'object' &&
      (data as RuntimeMessage).source === RUNTIME_SOURCE,
  );
}

export const EMPTY_PAGE_STATE: PageState = {
  isYouTube: false,
  videoId: null,
  channelId: null,
  channelName: null,
  title: null,
  playbackRate: null,
  spokenWpm: null,
  hasTranscript: false,
  transcriptStatus: 'unavailable',
  automationActive: false,
  blockReason: null,
  isShorts: false,
  isLive: false,
  isMusic: false,
};
