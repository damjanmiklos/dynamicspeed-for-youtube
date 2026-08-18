import {
  BRIDGE_SOURCE,
  isTrustedBridgeEvent,
  type BridgeEventName,
  type BridgeMessage,
  type BridgeRequestName,
} from './protocol';

let requestSeq = 0;

export function postBridge(message: Omit<BridgeMessage, 'source'>): void {
  window.postMessage({ ...message, source: BRIDGE_SOURCE }, window.location.origin);
}

export function requestFromMain<T>(
  name: BridgeRequestName,
  videoId: string,
  payload: unknown,
  timeoutMs = 8000,
): Promise<T> {
  const requestId = `ds-${Date.now()}-${(requestSeq += 1)}`;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error(`Bridge request ${name} timed out`));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedBridgeEvent(event)) {
        return;
      }
      const message = event.data as BridgeMessage;
      if (message.type !== 'DS_RESPONSE' || message.requestId !== requestId) {
        return;
      }
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (message.error) {
        reject(new Error(message.error));
        return;
      }
      resolve(message.payload as T);
    };

    window.addEventListener('message', onMessage);
    postBridge({
      type: 'DS_REQUEST',
      name,
      requestId,
      videoId,
      payload,
    });
  });
}

export function listenToMainEvents(
  handler: (name: BridgeEventName, message: BridgeMessage) => void,
): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!isTrustedBridgeEvent(event)) {
      return;
    }
    const message = event.data as BridgeMessage;
    if (message.type !== 'DS_EVENT' || !message.name) {
      return;
    }
    handler(message.name as BridgeEventName, message);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
