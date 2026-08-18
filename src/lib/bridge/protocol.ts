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

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const message = data as BridgeMessage;
  return (
    message.source === BRIDGE_SOURCE &&
    (message.type === 'DS_REQUEST' ||
      message.type === 'DS_RESPONSE' ||
      message.type === 'DS_EVENT')
  );
}

export function isTrustedBridgeEvent(event: MessageEvent): boolean {
  return (
    event.source === window &&
    isYouTubeOrigin(event.origin) &&
    isBridgeMessage(event.data)
  );
}
