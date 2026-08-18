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
  speedConflict: boolean;
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
  if (!data || typeof data !== 'object') {
    return false;
  }
  const message = data as Record<string, unknown>;
  if (message.source !== RUNTIME_SOURCE || typeof message.type !== 'string') {
    return false;
  }
  switch (message.type) {
    case 'GET_PAGE_STATE':
    case 'TOGGLE_CHANNEL':
    case 'TOGGLE_VIDEO':
    case 'OPEN_OPTIONS':
    case 'SETTINGS_CHANGED':
      return true;
    case 'PAGE_STATE':
      return typeof message.state === 'object' && message.state !== null;
    case 'COMMAND':
      return typeof message.command === 'string' && message.command.length <= 64;
    default:
      return false;
  }
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
  speedConflict: false,
  blockReason: null,
  isShorts: false,
  isLive: false,
  isMusic: false,
};
