import browser from "webextension-polyfill";
import {
  envelope,
  isEnvelope,
  type MessageKind,
  type MessageReq,
  type MessageRes,
} from "./protocol";

/** Send a typed message to the background service worker. */
export async function sendToBackground<K extends MessageKind>(
  kind: K,
  payload: MessageReq<K>,
): Promise<MessageRes<K>> {
  return (await browser.runtime.sendMessage(envelope(kind, payload))) as MessageRes<K>;
}

/** Send a typed message to the content script in a specific tab. */
export async function sendToTab<K extends MessageKind>(
  tabId: number,
  kind: K,
  payload: MessageReq<K>,
): Promise<MessageRes<K>> {
  return (await browser.tabs.sendMessage(tabId, envelope(kind, payload))) as MessageRes<K>;
}

/** Fire-and-forget broadcast to every extension page (currently: the popup). */
export function broadcast<K extends MessageKind>(kind: K, payload: MessageReq<K>): void {
  void browser.runtime.sendMessage(envelope(kind, payload)).catch(() => {
    // No listener (e.g. popup closed) — that's fine.
  });
}

type Handler<K extends MessageKind> = (
  payload: MessageReq<K>,
  sender: browser.Runtime.MessageSender,
) => Promise<MessageRes<K>> | MessageRes<K>;

export type Handlers = { [K in MessageKind]?: Handler<K> };

/**
 * Register a message router in the current context. Unknown kinds are ignored
 * (returns undefined) so multiple routers can coexist across contexts.
 */
export function createRouter(handlers: Handlers): void {
  browser.runtime.onMessage.addListener((message: unknown, sender: browser.Runtime.MessageSender) => {
    if (!isEnvelope(message)) return undefined;
    const handler = handlers[message.kind] as Handler<MessageKind> | undefined;
    if (!handler) return undefined;
    return Promise.resolve(handler(message.payload, sender));
  });
}

/** Subscribe to broadcasts of a single kind (for UI live updates). */
export function onBroadcast<K extends MessageKind>(
  kind: K,
  fn: (payload: MessageReq<K>) => void,
): () => void {
  const listener = (message: unknown) => {
    if (isEnvelope(message) && message.kind === kind) {
      fn(message.payload as MessageReq<K>);
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
