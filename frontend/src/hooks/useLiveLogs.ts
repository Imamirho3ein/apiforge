import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { API_BASE_URL } from '../lib/api';
import { toWebSocketUrl } from '../lib/format';
import {
  createReconnectingSocket,
  type ReconnectingSocket,
  type SocketStatus,
} from '../lib/ws';
import type { LogEntry, WsLogMessage } from '../lib/types';

const MAX_LIVE_LOGS = 200;

/**
 * Opens `ws(s)://<host>/ws/logs/?token=<access_jwt>` and collects pushed logs.
 *
 * The socket closes when `enabled` goes false, when the user logs out, on
 * unmount, and whenever `streamKey` changes (the user edits the log filters) —
 * the buffered rows are reset in that case so stale rows are not re-labelled.
 * Reconnects use exponential backoff and stop permanently on auth failure
 * (close code 4401).
 */
export function useLiveLogs(enabled: boolean, streamKey: string) {
  const token = useAuthStore((state) => state.accessToken);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<SocketStatus>('closed');
  const socketRef = useRef<ReconnectingSocket | null>(null);

  useEffect(() => {
    setLiveLogs([]);

    if (!enabled || !token) {
      socketRef.current?.close();
      socketRef.current = null;
      setStatus('closed');
      return;
    }

    const base = toWebSocketUrl(API_BASE_URL, '/ws/logs/');
    const separator = base.includes('?') ? '&' : '?';
    const url = `${base}${separator}token=${encodeURIComponent(token)}`;

    const socket = createReconnectingSocket({
      url,
      onStatusChange: setStatus,
      onMessage: (data) => {
        const message = data as Partial<WsLogMessage> | null;
        if (message?.type === 'log.created' && message.data?.id) {
          const incoming = message.data;
          setLiveLogs((prev) => {
            if (prev.some((log) => log.id === incoming.id)) return prev;
            return [incoming, ...prev].slice(0, MAX_LIVE_LOGS);
          });
        }
      },
      shouldReconnect: ({ code }) => code !== 4401,
    });
    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [enabled, token, streamKey]);

  const clearLiveLogs = useCallback(() => setLiveLogs([]), []);

  return { liveLogs, status, clearLiveLogs };
}
