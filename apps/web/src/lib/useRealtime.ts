'use client';

import { useEffect, useRef, useState } from 'react';

export interface RealtimeMessage {
  type?: string;
  [key: string]: unknown;
}

/**
 * Connects to the CinneTemple WebSocket API (NEXT_PUBLIC_REALTIME_URL) and
 * surfaces connection state + the latest message. Auto-reconnects with backoff.
 * No-ops when the URL isn't configured (local dev).
 */
export function useRealtime() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_REALTIME_URL;
    if (!url || typeof window === 'undefined') return;

    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          setLastMessage(JSON.parse(event.data) as RealtimeMessage);
        } catch {
          /* ignore non-JSON frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          attempt += 1;
          timer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000));
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socketRef.current?.close();
    };
  }, []);

  return { connected, lastMessage };
}
