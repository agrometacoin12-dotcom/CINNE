'use client';

import { useEffect, useRef, useState } from 'react';

interface SecurePlayerProps {
  src: string;
  /** Per-viewer text drifted across the frame to deter screen capture. */
  watermark: string;
  poster?: string | null;
  /** ISO time the viewing window closes; shows a countdown and locks on expiry. */
  expiresAt?: string | null;
  onExpired?: () => void;
}

/**
 * Hardened HTML5 player. True screenshot/screen-record blocking is only possible
 * on native iOS; on web we apply best-effort deterrents: a drifting per-viewer
 * watermark, no-download/PiP controls, right-click + selection disabled, and
 * auto-pause when the tab loses focus.
 */
export function SecurePlayer({ src, watermark, poster, expiresAt, onExpired }: SecurePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState({ top: '12%', left: '8%' });
  const [remaining, setRemaining] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  // Drift the watermark to a new corner-ish position periodically.
  useEffect(() => {
    const move = () => {
      setPos({
        top: `${10 + Math.random() * 75}%`,
        left: `${5 + Math.random() * 70}%`,
      });
    };
    move();
    const t = setInterval(move, 4000);
    return () => clearInterval(t);
  }, []);

  // Pause when the tab is hidden (deters background screen recording).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) videoRef.current?.pause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Countdown + lockout on window expiry.
  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) {
        setLocked(true);
        videoRef.current?.pause();
        setRemaining(null);
        onExpired?.();
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setRemaining(h > 0 ? `${h}h ${m}m left` : `${m}m left`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [expiresAt, onExpired]);

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-glass border border-white/10 bg-black"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: 'none' }}
    >
      {!locked ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          controls
          autoPlay
          playsInline
          controlsList="nodownload noremoteplayback noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
          <span className="text-2xl">⏳</span>
          <p className="font-semibold">Your viewing window has ended</p>
          <p className="text-sm text-white/60">This was a single-view ticket. Purchase again to rewatch.</p>
        </div>
      )}

      {/* Drifting watermark */}
      {!locked && (
        <div
          aria-hidden
          className="pointer-events-none absolute select-none text-[11px] font-medium text-white/35 transition-all duration-1000"
          style={{ top: pos.top, left: pos.left, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
        >
          {watermark}
        </div>
      )}

      {/* Static corner watermark (always present) */}
      {!locked && (
        <div className="pointer-events-none absolute bottom-2 right-3 select-none text-[10px] text-white/30">
          CinneTemple · {watermark}
        </div>
      )}

      {remaining && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
          {remaining}
        </div>
      )}
    </div>
  );
}
