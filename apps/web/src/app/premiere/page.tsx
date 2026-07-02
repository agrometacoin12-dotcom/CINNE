'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ChatMessage, PlaybackSession, PremiereRoom, TitleSummary } from '@cinnetemple/shared';
import { SecurePlayer } from '@/components/player/SecurePlayer';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

const REACTIONS: [string, string][] = [
  ['🔥', '2.1K'],
  ['❤️', '1.4K'],
  ['😂', '890'],
  ['👏', '764'],
  ['🤯', '512'],
];

function Countdown({ to }: { to: string }) {
  const [label, setLabel] = useState('00 : 00 : 00');
  useEffect(() => {
    const target = new Date(to).getTime();
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLabel(
        `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`,
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [to]);
  return <span>{label}</span>;
}

/* eslint-disable @next/next/no-img-element */
/**
 * Premiere room — exact Figma frames 51:16148 (live) and 56:416 (countdown):
 * video stage (1000×562) with ● LIVE / PREMIERE badges (countdown state:
 * STARTS SOON badge, centered 90px timer, Notify me), title "X — World
 * Premiere", status line, reaction chips (86×40), "Up next after the premiere"
 * tiles (84×112), and a full-height 344px Live Chat panel on the right.
 */
function PremiereRoomView() {
  const id = useSearchParams().get('id') ?? '';
  const [room, setRoom] = useState<PremiereRoom | null>(null);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [upNext, setUpNext] = useState<TitleSummary[]>([]);
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

  useEffect(() => {
    api
      .browse()
      .then((b) => {
        const seen = new Set<string>([id]);
        const rest: TitleSummary[] = [];
        b.rows.forEach((r) =>
          r.items.forEach((t) => {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              rest.push(t);
            }
          }),
        );
        setUpNext(rest.slice(0, 3));
      })
      .catch(() => undefined);
  }, [id]);

  // Start playback once live + entitled.
  useEffect(() => {
    if (room?.live && room.entitled && !session) {
      api
        .playbackStart(id)
        .then(setSession)
        .catch(() => undefined);
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
      <div className="flex min-h-[50vh] items-center justify-center bg-[#090b12]">
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        )}
      </div>
    );
  }

  const badge = (label: string, live = false) => (
    <span
      className={`lg-glass grid h-8 place-items-center rounded-full px-4 text-xs font-bold tracking-wide text-white ${live ? '' : ''}`}
      style={{ background: live ? 'rgba(242,77,77,0.35)' : 'rgba(214,214,214,0.12)' }}
    >
      {label}
    </span>
  );

  return (
    <main className="min-h-screen bg-[#090b12] px-4 pb-16 pt-6 text-white sm:px-12">
      <div className="grid gap-6 xl:grid-cols-[1fr_344px]">
        {/* ── Video stage + meta ── */}
        <div>
          <div className="relative aspect-[1000/562] w-full overflow-hidden rounded-2xl bg-black">
            {room.live && session ? (
              <SecurePlayer
                src={session.url}
                watermark={session.watermark}
                expiresAt={session.expiresAt}
                title={room.title}
              />
            ) : (
              <>
                <div className="absolute inset-0 bg-[#05060a]" />
                {/* Badges */}
                <div className="absolute left-5 top-5 flex gap-3.5">
                  {room.live ? badge('● LIVE', true) : badge('STARTS SOON', true)}
                  {badge('PREMIERE')}
                </div>
                {room.live && !room.entitled ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="text-4xl">🎟️</div>
                    <p className="font-semibold">The premiere is live</p>
                    <p className="text-sm text-white/60">
                      Get a ticket to watch and join the chat.
                    </p>
                    <Link
                      href={`/title?id=${id}`}
                      className="lg-glass-indigo-35 mt-2 grid h-12 w-[170px] place-items-center rounded-[12px] text-sm font-semibold text-white"
                    >
                      Get a ticket
                    </Link>
                  </div>
                ) : (
                  <div className="absolute inset-x-0 top-[35%] flex flex-col items-center text-center">
                    <p className="text-sm text-white/70">Premiere starts in</p>
                    <p className="font-logo mt-1 text-5xl font-bold text-white sm:text-[76px] sm:leading-[90px]">
                      {room.premiereStartAt ? <Countdown to={room.premiereStartAt} /> : 'Soon'}
                    </p>
                    <Link
                      href={room.entitled ? '#' : `/title?id=${id}`}
                      className="lg-glass-indigo-35 mt-6 grid h-12 w-[170px] place-items-center rounded-[12px] text-sm font-semibold text-white"
                    >
                      {room.entitled ? 'Notify me' : 'Reserve a ticket'}
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Title + status — 51:16155/16156 */}
          <h1 className="mt-8 font-readex text-4xl font-bold">{room.title} — World Premiere</h1>
          <p className="mt-3 text-sm text-white/60">
            {room.live
              ? `Premiere ends in 42:16  •  12,438 watching now  •  Chat is live`
              : `Starts ${room.premiereStartAt ? new Date(room.premiereStartAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'soon'}  •  3,204 waiting  •  Pre-show chat is open`}
          </p>

          {/* Reactions — 86×40 chips */}
          <div className="mt-4 flex flex-wrap gap-3.5">
            {REACTIONS.map(([emoji, count]) => (
              <button
                key={emoji}
                className="lg-glass grid h-10 w-[86px] place-items-center rounded-full text-[13px] text-white"
                style={{ background: 'rgba(214,214,214,0.08)' }}
              >
                {emoji} {count}
              </button>
            ))}
          </div>

          {/* Up next — 84×112 tiles */}
          <p className="mt-9 text-sm text-white/70">Up next after the premiere</p>
          <div className="mt-3 flex gap-4">
            {upNext.map((t) => (
              <UpNextTile key={t.id} item={t} />
            ))}
          </div>
        </div>

        {/* ── Live Chat Panel — 344px (51:16177) ── */}
        <div
          className="lg-glass flex h-[70vh] flex-col rounded-2xl p-6 xl:h-auto"
          style={{ background: 'rgba(214,214,214,0.07)' }}
        >
          <h2 className="font-readex text-2xl font-semibold text-white">Live Chat</h2>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.map((m) => (
              <div key={m.id} className="text-sm leading-snug">
                <span className="font-semibold text-[#8082ff]">{m.author}</span>{' '}
                <span className="text-white/85">{m.body}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-xs text-white/50">
                {room.canChat
                  ? 'Be the first to say something.'
                  : 'Chat opens when the premiere is live and you have a ticket.'}
              </p>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={send} className="mt-4 flex gap-2">
            <input
              className="lg-input h-11 flex-1 rounded-[12px] px-4 text-sm text-white outline-none placeholder:text-white/50 disabled:opacity-50"
              placeholder={room.canChat ? 'Say something…' : 'Chat unavailable'}
              value={draft}
              maxLength={500}
              disabled={!room.canChat}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              disabled={!room.canChat || !draft.trim()}
              className="lg-glass-indigo-35 h-11 rounded-[12px] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </main>
  );
}

function UpNextTile({ item }: { item: TitleSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link
      href={`/title?id=${item.id}`}
      className="block h-[112px] w-[84px] overflow-hidden rounded-[10px]"
    >
      {!broken ? (
        <img
          src={item.posterUrl ?? `/art/posters/${item.id}.jpg`}
          alt={item.title}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center p-1 text-center text-[9px] font-semibold text-white"
          style={{ background: gradientCss(item.id) }}
        >
          {item.title}
        </div>
      )}
    </Link>
  );
}

export default function PremierePage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <PremiereRoomView />
      </Suspense>
    </RequireAuth>
  );
}
