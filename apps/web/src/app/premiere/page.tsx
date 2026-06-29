'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ChatMessage, PlaybackSession, PremiereRoom } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { SecurePlayer } from '@/components/player/SecurePlayer';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError } from '@/lib/api';

function Countdown({ to }: { to: string }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const target = new Date(to).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) { setLabel('Starting…'); return; }
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor((ms % 86_400_000) / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLabel(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [to]);
  return <span className="font-mono text-2xl">{label}</span>;
}

function PremiereRoomView() {
  const id = useSearchParams().get('id') ?? '';
  const [room, setRoom] = useState<PremiereRoom | null>(null);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lastTs = useRef<string | undefined>(undefined);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadRoom = useCallback(() => {
    if (!id) return;
    api
      .premiereRoom(id)
      .then(setRoom)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load premiere'));
  }, [id]);

  useEffect(loadRoom, [loadRoom]);

  // Start playback once live + entitled.
  useEffect(() => {
    if (room?.live && room.entitled && !session) {
      api.playbackStart(id).then(setSession).catch(() => undefined);
    }
  }, [room, session, id]);

  // Poll chat while the room is open to the viewer.
  useEffect(() => {
    if (!room?.canChat) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await api.premiereChat(id, lastTs.current);
        if (cancelled || next.length === 0) return;
        lastTs.current = next[next.length - 1].createdAt;
        setMessages((prev) => [...prev, ...next].slice(-300));
      } catch {
        /* transient */
      }
    };
    void poll();
    const t = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [room, id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      const msg = await api.postPremiereChat(id, body);
      lastTs.current = msg.createdAt;
      setMessages((prev) => [...prev, msg].slice(-300));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send');
    }
  };

  if (!room) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        {error ? <p className="text-sm text-red-300">{error}</p> : <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-extrabold">{room.title}</h1>
        {room.live ? (
          <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300">● LIVE</span>
        ) : (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">Premiere</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {room.live && session ? (
            <SecurePlayer src={session.url} watermark={session.watermark} expiresAt={session.expiresAt} />
          ) : room.live && !room.entitled ? (
            <GlassPanel className="flex aspect-video flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="text-4xl">🎟️</div>
              <p className="font-semibold">The premiere is live</p>
              <p className="text-sm text-[var(--text-secondary)]">Get a ticket to watch and join the chat.</p>
              <Link href={`/title?id=${id}`}><Button variant="primary">Get a ticket</Button></Link>
            </GlassPanel>
          ) : (
            <GlassPanel className="flex aspect-video flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-[var(--text-secondary)]">Premiere begins in</p>
              {room.premiereStartAt ? <Countdown to={room.premiereStartAt} /> : <span>Soon</span>}
              {!room.entitled && (
                <Link href={`/title?id=${id}`} className="mt-2"><Button variant="glass">Reserve a ticket</Button></Link>
              )}
            </GlassPanel>
          )}
        </div>

        <GlassPanel className="flex h-[60vh] flex-col p-4">
          <h2 className="mb-2 text-sm font-semibold">Live chat</h2>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-semibold text-[var(--text-primary)]">{m.author}</span>{' '}
                <span className="text-[var(--text-secondary)]">{m.body}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-xs text-[var(--text-secondary)]">
                {room.canChat ? 'Be the first to say something.' : 'Chat opens when the premiere is live and you have a ticket.'}
              </p>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={send} className="mt-3 flex gap-2">
            <input
              className="glass flex-1 rounded-full px-4 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50"
              placeholder={room.canChat ? 'Say something…' : 'Chat unavailable'}
              value={draft}
              maxLength={500}
              disabled={!room.canChat}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={!room.canChat || !draft.trim()}>Send</Button>
          </form>
        </GlassPanel>
      </div>
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </main>
  );
}

export default function PremierePage() {
  return (
    <RequireAuth>
      <GlassNav />
      <Suspense fallback={null}>
        <PremiereRoomView />
      </Suspense>
    </RequireAuth>
  );
}
