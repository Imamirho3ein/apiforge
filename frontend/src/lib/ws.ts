/**
 * Minimal reconnecting WebSocket helper with exponential backoff.
 * The auth token is expected to already be part of the URL (query string).
 */

export type SocketStatus = 'connecting' | 'open' | 'closed';

export interface ReconnectingSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onStatusChange?: (status: SocketStatus) => void;
  /** Return false to stop reconnecting (e.g. auth failure close code 4401). */
  shouldReconnect?: (info: { code: number; reason: string }) => boolean;
}

export interface ReconnectingSocket {
  close: () => void;
}

const MAX_BACKOFF_MS = 30_000;

export function createReconnectingSocket(
  options: ReconnectingSocketOptions,
): ReconnectingSocket {
  const { url, onMessage, onStatusChange, shouldReconnect } = options;

  let socket: WebSocket | null = null;
  let closedByClient = false;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (status: SocketStatus) => onStatusChange?.(status);

  const cleanup = () => {
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket = null;
    }
  };

  const connect = () => {
    if (closedByClient) return;
    setStatus('connecting');
    socket = new WebSocket(url);

    socket.onopen = () => {
      attempts = 0;
      setStatus('open');
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!onMessage) return;
      try {
        onMessage(JSON.parse(event.data as string));
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onerror = () => {
      // `onclose` always follows an error; nothing to do here.
    };

    socket.onclose = (event: CloseEvent) => {
      cleanup();
      if (closedByClient) {
        setStatus('closed');
        return;
      }
      const canReconnect = shouldReconnect
        ? shouldReconnect({ code: event.code, reason: event.reason })
        : true;
      if (!canReconnect) {
        setStatus('closed');
        return;
      }
      setStatus('closed');
      const delay = Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
      attempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close: () => {
      closedByClient = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.close();
        cleanup();
      }
      setStatus('closed');
    },
  };
}
