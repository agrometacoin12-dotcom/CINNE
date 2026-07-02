'use client';

import { useEffect, useRef, useState } from 'react';

interface SecurePlayerProps {
  src: string;
  watermark: string;
  title?: string;
  subtitle?: string;
  poster?: string | null;
  expiresAt?: string | null;
  onExpired?: () => void;
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Figma player UI: full backdrop + scrim, top-left title/meta, centered glass
 * rewind/play/forward (play in indigo glass), and a bottom glass panel with an
 * indigo progress bar + timecodes + controls. Keeps the anti-piracy layer:
 * drifting per-viewer watermark, no native download, auto-pause on tab blur,
 * single-view expiry lockout.
 */
export function SecurePlayer({ src, watermark, title, subtitle, poster, expiresAt, onExpired }: SecurePlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [wm, setWm] = useState({ top: '14%', left: '10%' });
  const [remaining, setRemaining] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const move = () => setWm({ top: `${10 + Math.random() * 74}%`, left: `${6 + Math.random() * 70}%` });
    move();
    const t = setInterval(move, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onVis = () => { if (document.hidden) video.current?.pause(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) { setLocked(true); video.current?.pause(); setRemaining(null); onExpired?.(); return; }
      const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
      setRemaining(h > 0 ? `${h}h ${m}m left` : `${m}m left`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [expiresAt, onExpired]);

  const seek = (delta: number) => { const v = video.current; if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta)); };
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); };
  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = video.current; if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };
  const fullscreen = () => { void wrapRef.current?.requestFullscreen?.(); };
  const toggleMute = () => { const v = video.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div ref={wrapRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black" onContextMenu={(e) => e.preventDefault()} style={{ userSelect: 'none' }}>
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
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-white">
          <span className="text-2xl">⏳</span>
          <p className="font-semibold">Your viewing window has ended</p>
          <p className="text-sm text-white/60">This was a single-view ticket. Purchase again to rewatch.</p>
        </div>
      )}

      {/* Scrim */}
      {!locked && <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />}

      {/* Top-left title/meta */}
      {!locked && (title || subtitle) && (
        <div className="pointer-events-none absolute left-8 top-6">
          {title && <p className="text-lg font-semibold text-white">{title}</p>}
          {subtitle && <p className="mt-1 text-[13px] text-white/60">{subtitle}</p>}
        </div>
      )}

      {/* Watermark */}
      {!locked && (
        <>
          <div aria-hidden className="pointer-events-none absolute select-none text-[11px] font-medium text-white/35 transition-all duration-1000" style={{ top: wm.top, left: wm.left, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{watermark}</div>
          <div className="pointer-events-none absolute bottom-32 right-4 select-none text-[10px] text-white/25">CinneTemple · {watermark}</div>
        </>
      )}

      {/* Center controls */}
      {!locked && (
        <div className="absolute inset-0 flex items-center justify-center gap-8">
          <button onClick={() => seek(-15)} className="lg-glass grid h-16 w-16 place-items-center rounded-full text-[13px] text-white" aria-label="Rewind 15s">⟲15</button>
          <button onClick={toggle} className="lg-glass-indigo grid h-24 w-24 place-items-center rounded-full text-4xl text-white" aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
          <button onClick={() => seek(15)} className="lg-glass grid h-16 w-16 place-items-center rounded-full text-[13px] text-white" aria-label="Forward 15s">15⟳</button>
        </div>
      )}

      {/* Bottom panel */}
      {!locked && (
        <div className="lg-glass absolute inset-x-8 bottom-6 rounded-[18px] px-6 py-4">
          <div className="relative h-1 w-full cursor-pointer rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }} onClick={scrub}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: '#6C6FFC' }} />
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white" style={{ left: `calc(${pct}% - 7px)` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-white/85">{fmt(cur)}{remaining ? ` · ${remaining}` : ''}</span>
            <span className="text-white/50">{fmt(dur)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-white/90">
            <div className="flex items-center gap-4 text-lg">
              <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
              <button onClick={toggleMute} aria-label="Mute">{muted ? '🔇' : '🔊'}</button>
            </div>
            <div className="flex items-center gap-4 text-base text-white/90">
              <button aria-label="Captions">CC</button>
              <button aria-label="Settings">⚙</button>
              <button onClick={fullscreen} aria-label="Fullscreen">⤢</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
