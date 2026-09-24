import { MAX_TOKENS, MAX_WORD_CHARS } from '../transcript/limits';
import type { TranscriptExport } from '../transcript/export';
import type { CacheMutation } from '../youtube/cache';

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
  | { source: typeof RUNTIME_SOURCE; type: 'GET_TRANSCRIPT' }
  | { source: typeof RUNTIME_SOURCE; type: 'TRANSCRIPT'; transcript: TranscriptExport }
  | { source: typeof RUNTIME_SOURCE; type: 'TOGGLE_CHANNEL' }
  | { source: typeof RUNTIME_SOURCE; type: 'TOGGLE_VIDEO' }
  | { source: typeof RUNTIME_SOURCE; type: 'OPEN_OPTIONS' }
  | { source: typeof RUNTIME_SOURCE; type: 'COMMAND'; command: string }
  | { source: typeof RUNTIME_SOURCE; type: 'SETTINGS_CHANGED' }
  | { source: typeof RUNTIME_SOURCE; type: 'CACHE_MUTATION'; mutation: CacheMutation };

const CACHE_MUTATION_KINDS = new Set(['put', 'touch', 'prune', 'clear']);

function isTranscriptExport(value: unknown): value is TranscriptExport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const transcript = value as Record<string, unknown>;
  if (!Array.isArray(transcript.words) || transcript.words.length > MAX_TOKENS) {
    return false;
  }
  if (typeof transcript.wordCount !== 'number' || typeof transcript.text !== 'string') {
    return false;
  }
  if (transcript.text.length > MAX_TOKENS * MAX_WORD_CHARS) {
    return false;
  }
  return (
    (transcript.videoId === null || typeof transcript.videoId === 'string') &&
    (transcript.title === null || typeof transcript.title === 'string') &&
    typeof transcript.transcriptStatus === 'string'
  );
}

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
    case 'GET_TRANSCRIPT':
    case 'TOGGLE_CHANNEL':
    case 'TOGGLE_VIDEO':
    case 'OPEN_OPTIONS':
    case 'SETTINGS_CHANGED':
      return true;
    case 'PAGE_STATE':
      return typeof message.state === 'object' && message.state !== null;
    case 'TRANSCRIPT':
      return isTranscriptExport(message.transcript);
    case 'CACHE_MUTATION': {
      // Field-level checks happen where the mutation is applied.
      const mutation = message.mutation as { kind?: unknown } | null;
      return (
        typeof mutation === 'object' &&
        mutation !== null &&
        typeof mutation.kind === 'string' &&
        CACHE_MUTATION_KINDS.has(mutation.kind)
      );
    }
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
