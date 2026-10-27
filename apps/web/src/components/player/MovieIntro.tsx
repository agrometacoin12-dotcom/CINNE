'use client';

import { useEffect, useRef } from 'react';

export function MovieIntro({ onFinished }: { onFinished: () => void }) {
  const clip = useRef<HTMLVideoElement>(null);
  const callback = useRef(onFinished);
  callback.current = onFinished;
  useEffect(() => {
    const video = clip.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video?.pause();
      callback.current();
    };
    const timer = setTimeout(finish, 5000);
    const visibility = () => { if (document.hidden) finish(); };
    document.addEventListener('visibilitychange', visibility);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else if (video) void video.play().catch(finish);
    return () => {
      done = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
      video?.pause();
    };
  }, []);
  const finish = () => { clip.current?.pause(); onFinished(); };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <video ref={clip} src="/splash.mp4" muted playsInline preload="auto"
        onEnded={finish} onError={finish} className="h-full w-full object-contain" aria-label="CinneTemple intro" />
      <button onClick={finish} className="absolute bottom-8 right-8 rounded-full bg-white/15 px-5 py-3 text-white">
        Skip intro
      </button>
    </div>
  );
}
