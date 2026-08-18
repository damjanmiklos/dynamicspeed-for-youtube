export const BRIDGE_SOURCE = 'dynamicspeed-player-bridge';

export type BridgeMessageType = 'DS_REQUEST' | 'DS_RESPONSE' | 'DS_EVENT';

export type BridgeRequestName = 'GET_PLAYER_SNAPSHOT' | 'ACQUIRE_FALLBACK_TRANSCRIPT';

export type BridgeEventName =
  | 'RAW_TRACKS_RESOLVED'
  | 'TIMEDTEXT_CAPTURED'
  | 'PLAYER_STATE_CHANGE'
  | 'VIDEO_ID_CHANGED';

export interface BridgeMessage<T = unknown> {
  source: typeof BRIDGE_SOURCE;
  type: BridgeMessageType;
  requestId?: string;
  videoId: string;
  name?: BridgeRequestName | BridgeEventName;
  payload: T;
  error?: string;
}

export type CaptionTrackPayload = {
  baseUrl: string;
  languageCode: string;
  languageName?: string;
  kind?: string;
  vssId?: string;
};

export type PlayerSnapshot = {
  videoId: string | null;
  title: string | null;
  channelId: string | null;
  channelName: string | null;
  duration: number | null;
  isLive: boolean;
  isShorts: boolean;
  isMusic: boolean;
  tracks: CaptionTrackPayload[];
};

export const YOUTUBE_ORIGINS = new Set([
  'https://www.youtube.com',
  'https://youtube.com',
  'https://m.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://youtube-nocookie.com',
  'https://music.youtube.com',
]);

export function isYouTubeOrigin(origin: string): boolean {
  return YOUTUBE_ORIGINS.has(origin);
}

const BRIDGE_TYPES = new Set(['DS_REQUEST', 'DS_RESPONSE', 'DS_EVENT']);
const BRIDGE_NAMES = new Set([
  'GET_PLAYER_SNAPSHOT',
  'ACQUIRE_FALLBACK_TRANSCRIPT',
  'RAW_TRACKS_RESOLVED',
  'TIMEDTEXT_CAPTURED',
  'PLAYER_STATE_CHANGE',
  'VIDEO_ID_CHANGED',
]);

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const message = data as Record<string, unknown>;
  if (message.source !== BRIDGE_SOURCE) {
    return false;
  }
  if (typeof message.type !== 'string' || !BRIDGE_TYPES.has(message.type)) {
    return false;
  }
  if (typeof message.videoId !== 'string' || message.videoId.length > 32) {
    return false;
  }
  if (message.name != null && (typeof message.name !== 'string' || !BRIDGE_NAMES.has(message.name))) {
    return false;
  }
  if (message.requestId != null && (typeof message.requestId !== 'string' || message.requestId.length > 80)) {
    return false;
  }
  return true;
}

export function isTrustedBridgeEvent(event: MessageEvent): boolean {
  return (
    event.source === window &&
    isYouTubeOrigin(event.origin) &&
    isBridgeMessage(event.data)
  );
}
