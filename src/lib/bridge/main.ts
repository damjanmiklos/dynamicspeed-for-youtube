import {
  BRIDGE_SOURCE,
  isTrustedBridgeEvent,
  type BridgeMessage,
  type BridgeRequestName,
  type PlayerSnapshot,
} from './protocol';

export type MainBridgeHandlers = {
  getSnapshot: () => PlayerSnapshot;
  fetchTimedText: (url: string) => Promise<unknown>;
};

function reply(request: BridgeMessage, payload: unknown, error?: string): void {
  const message: BridgeMessage = {
    source: BRIDGE_SOURCE,
    type: 'DS_RESPONSE',
    requestId: request.requestId,
    videoId: request.videoId,
    name: request.name,
    payload,
    error,
  };
  window.postMessage(message, window.location.origin);
}

export function emitBridgeEvent(
  name: BridgeMessage['name'],
  videoId: string,
  payload: unknown,
): void {
  const message: BridgeMessage = {
    source: BRIDGE_SOURCE,
    type: 'DS_EVENT',
    videoId,
    name,
    payload,
  };
  window.postMessage(message, window.location.origin);
}

export function listenToIsolatedRequests(handlers: MainBridgeHandlers): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!isTrustedBridgeEvent(event)) {
      return;
    }
    const message = event.data as BridgeMessage;
    if (message.type !== 'DS_REQUEST' || !message.requestId) {
      return;
    }
    const name = message.name as BridgeRequestName;
    void (async () => {
      try {
        if (name === 'GET_PLAYER_SNAPSHOT') {
          reply(message, handlers.getSnapshot());
          return;
        }
        if (name === 'FETCH_TIMEDTEXT') {
          const url =
            typeof message.payload === 'string'
              ? message.payload
              : String((message.payload as { url?: string })?.url ?? '');
          reply(message, await handlers.fetchTimedText(url));
          return;
        }
        throw new Error(`Unknown bridge request ${name}`);
      } catch (error) {
        reply(message, null, error instanceof Error ? error.message : String(error));
      }
    })();
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
