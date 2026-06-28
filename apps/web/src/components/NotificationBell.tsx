'use client';

import { useEffect, useState } from 'react';
import { useRealtime } from '@/lib/useRealtime';

/**
 * Glass bell that lights up when a realtime message arrives. Connection status
 * is reflected via a subtle dot (green = live).
 */
export function NotificationBell() {
  const { connected, lastMessage } = useRealtime();
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (lastMessage) setHasNew(true);
  }, [lastMessage]);

  return (
    <button
      type="button"
      aria-label={connected ? 'Notifications (live)' : 'Notifications'}
      onClick={() => setHasNew(false)}
      className="glass relative flex h-10 w-10 items-center justify-center rounded-full text-base transition hover:brightness-125"
    >
      🔔
      {hasNew && (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
      )}
      <span
        className={`absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full ${
          connected ? 'bg-emerald-400' : 'bg-zinc-500'
        }`}
      />
    </button>
  );
}
