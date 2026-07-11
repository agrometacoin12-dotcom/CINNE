'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface SecurePlayerProps {
  src: string;
  watermark: string;
  title?: string;
  subtitle?: string;
  poster?: string | null;
  expiresAt?: string | null;
  onExpired?: () => void;
  /** Title being played; when set, progress heartbeats are saved so the
   *  backend can detect single-view completion. */
  titleId?: string;
  /** Position (seconds) to resume from on load. */
  resumeSeconds?: number;
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Player — exact Figma web frame 42:14361 on desktop (glass back circle with
 * title + meta beside it, 64/96/64 center controls with indigo play, full-width
 * 112px glass panel: progress + knob, timecodes, volume left / CC · PiP ·
 * fullscreen right) and iPhone frame 42:13751 on mobile (centered title, CC
 * circle, inset bottom panel). Keeps the anti-piracy layer: drifting per-viewer
 * watermark, no native download, auto-pause on tab blur, single-view expiry.
 */
export function SecurePlayer({
  src,
  watermark,
  title,
  subtitle,
  poster,
  expiresAt,
  onExpired,
  titleId,
  resumeSeconds,
}: SecurePlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [wm, setWm] = useState({ top: '14%', left: '10%' });
  const [remaining, setRemaining] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const resumed = useRef(false);

  useEffect(() => {
    const move = () =>
      setWm({ top: `${10 + Math.random() * 74}%`, left: `${6 + Math.random() * 70}%` });
    move();
    const t = setInterval(move, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) video.current?.pause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Save a playback progress heartbeat. Backend uses these to detect single-view
  // completion (which consumes the entitlement) and to power Continue Watching.
  const saveProgress = useCallback(() => {
    if (!titleId) return;
    const v = video.current;
    if (!v || !v.duration || !isFinite(v.duration)) return;
    void api
      .playbackSaveProgress(titleId, Math.floor(v.currentTime), Math.floor(v.duration))
      .catch(() => undefined);
  }, [titleId]);

  useEffect(() => {
    if (!titleId) return;
    const beat = setInterval(() => {
      const v = video.current;
      if (v && !v.paused) saveProgress();
    }, 10_000);
    const onHide = () => saveProgress();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveProgress);
    return () => {
      clearInterval(beat);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveProgress);
      saveProgress();
    };
  }, [titleId, saveProgress]);

  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) {
        setLocked(true);
        video.current?.pause();
        setRemaining(null);
        onExpired?.();
        return;
      }
      const h = Math.floor(ms / 3_600_000),
        m = Math.floor((ms % 3_600_000) / 60_000);
      setRemaining(h > 0 ? `${h}h ${m}m left` : `${m}m left`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [expiresAt, onExpired]);

  const seek = (delta: number) => {
    const v = video.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = video.current;
    if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };
  const fullscreen = () => {
    void wrapRef.current?.requestFullscreen?.();
  };
  const toggleMute = () => {
    const v = video.current;
    if (v) {
      v.muted = !v.muted;
      setMuted(v.muted);
    }
  };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: 'none' }}
    >
      {!locked ? (
        <video
          ref={video}
          src={src}
          poster={poster ?? undefined}
          autoPlay
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            saveProgress();
          }}
          onEnded={saveProgress}
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDur(v.duration);
            if (
              !resumed.current &&
              resumeSeconds &&
              resumeSeconds > 0 &&
              isFinite(v.duration) &&
              resumeSeconds < v.duration - 5
            ) {
              v.currentTime = resumeSeconds;
            }
            resumed.current = true;
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-white">
          <span className="text-2xl">⏳</span>
          <p className="font-semibold">Your viewing window has ended</p>
          <p className="text-sm text-white/60">
            This was a single-view ticket. Purchase again to rewatch.
          </p>
        </div>
      )}

      {/* Scrim — 42:14363 */}
      {!locked && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.35)' }}
        />
      )}

      {/* Top bar — desktop: back + title/meta left (42:14364…14367); mobile: centered title + CC */}
      {!locked && (
        <>
          <div className="absolute left-4 top-4 hidden items-center gap-5 sm:left-12 sm:top-12 sm:flex">
            <button
              onClick={() => (typeof history !== 'undefined' ? history.back() : undefined)}
              aria-label="Back"
              className="lg-glass grid h-12 w-12 place-items-center rounded-[24px] text-xl text-white"
            >
              ←
            </button>
            <div>
              {title && <p className="text-lg font-semibold text-white">{title}</p>}
              {subtitle && <p className="mt-0.5 text-[13px] text-white/60">{subtitle}</p>}
            </div>
          </div>
          <div className="absolute inset-x-4 top-14 flex items-center justify-between sm:hidden">
            <button
              onClick={() => (typeof history !== 'undefined' ? history.back() : undefined)}
              aria-label="Back"
              className="lg-glass grid h-10 w-10 place-items-center rounded-[20px] text-lg text-white"
            >
              ←
            </button>
            {title && (
              <p className="pointer-events-none flex-1 truncate px-3 text-center text-[14px] font-semibold text-white">
                {title}
              </p>
            )}
            <button
              aria-label="Captions"
              className="lg-glass grid h-10 w-10 place-items-center rounded-[20px] text-[12px] text-white"
            >
              CC
            </button>
          </div>
        </>
      )}

      {/* Watermark */}
      {!locked && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute flex select-none flex-col items-center gap-0.5 text-[11px] font-medium text-white/35 transition-all duration-1000"
            style={{ top: wm.top, left: wm.left, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
          >
            <img src="/art/figma/c-logo.png" alt="" className="w-12 opacity-60 object-contain" />
            {watermark}
          </div>
          <div className="pointer-events-none absolute bottom-32 right-4 flex select-none items-center gap-1 text-[10px] text-white/25">
            <img src="/art/figma/c-logo.png" alt="" className="h-4 w-4 object-contain opacity-60" />
            CinneTemple · {watermark}
          </div>
        </>
      )}

      {/* Center controls — 64/96/64 desktop (42:14368…14373), 52/76/52 mobile */}
      {!locked && (
        <div className="absolute inset-0 flex items-center justify-center gap-4 sm:gap-4">
          <button
            onClick={() => seek(-15)}
            className="lg-glass grid h-[52px] w-[52px] place-items-center rounded-full text-[12px] text-white sm:h-16 sm:w-16 sm:text-sm"
            aria-label="Rewind 15s"
          >
            ⟲ 15
          </button>
          <button
            onClick={toggle}
            className="lg-glass-indigo-35 mx-2 grid h-[76px] w-[76px] place-items-center rounded-full text-[26px] text-white sm:h-24 sm:w-24 sm:text-[34px]"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            onClick={() => seek(15)}
            className="lg-glass grid h-[52px] w-[52px] place-items-center rounded-full text-[12px] text-white sm:h-16 sm:w-16 sm:text-sm"
            aria-label="Forward 15s"
          >
            15 ⟳
          </button>
        </div>
      )}

      {/* Bottom panel — desktop 112px full-width (42:14374); mobile inset */}
      {!locked && (
        <div className="lg-glass absolute inset-x-4 bottom-6 rounded-[16px] px-4 pb-4 pt-6 sm:inset-x-12 sm:bottom-12 sm:h-28 sm:rounded-[18px] sm:px-6 sm:pb-0 sm:pt-6">
          <div
            className="relative h-1 w-full cursor-pointer rounded-full"
            style={{ background: 'rgba(255,255,255,0.25)' }}
            onClick={scrub}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${pct}%`, background: '#6c6ffc' }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white sm:h-3.5 sm:w-3.5"
              style={{ left: `calc(${pct}% - 6px)` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] sm:text-xs">
            <span className="text-white/85">
              {fmt(cur)}
              {remaining ? ` · ${remaining}` : ''}
            </span>
            <span className="text-white/50">{fmt(dur)}</span>
          </div>
          {/* Desktop: volume left · CC/PiP/fullscreen right */}
          <div className="mt-1.5 hidden items-center justify-between text-base text-white/90 sm:flex">
            <button onClick={toggleMute} aria-label="Mute" className="flex items-center gap-2">
              {muted ? '🔇' : '🔊'}
              <span className="text-white/50">───</span>
            </button>
            <div className="flex items-center gap-10">
              <button aria-label="Captions">CC</button>
              <button aria-label="Picture in picture">▭</button>
              <button onClick={fullscreen} aria-label="Fullscreen">
                ⤢
              </button>
            </div>
          </div>
          {/* Mobile: centered icon row */}
          <div className="mt-3 flex items-center justify-center gap-10 text-[15px] text-white/90 sm:hidden">
            <button aria-label="Settings">⚙</button>
            <button aria-label="Captions">CC</button>
            <button onClick={toggleMute} aria-label="Mute">
              {muted ? '🔇' : '♡'}
            </button>
            <button onClick={fullscreen} aria-label="Fullscreen">
              ⤢
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
