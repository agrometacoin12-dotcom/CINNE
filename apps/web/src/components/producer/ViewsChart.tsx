'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Views per day, last 30 days — one series, so no legend (the card title names
 * it). Columns ≤ 18px with a 4px rounded top on a hairline baseline, recessive
 * gridlines, per-bar hover tooltip with a hit target wider than the mark, and a
 * table view for screen readers / exact numbers.
 */

const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };
const BAR = '#7c7ffd';
const BAR_DIM = 'rgba(124,127,253,0.45)';

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= v) ?? 10 * pow;
  return step * 4;
}

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-NG', { ...opts, timeZone: 'UTC' });

export function ViewsChart({ data }: { data: { date: string; views: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.views))), [data]);

  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(18, slot - 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const total = data.reduce((s, d) => s + d.views, 0);
  const hovered = hover !== null ? data[hover] : undefined;

  return (
    <div>
      <div className="relative" ref={box} onMouseLeave={() => setHover(null)}>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`Views per day over the last 30 days, ${total.toLocaleString('en-NG')} in total`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.4)"
                fontSize={10.5}
              >
                {Number.isInteger(t) ? t.toLocaleString('en-NG') : ''}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const top = y(d.views);
            const h = PAD.top + innerH - top;
            const r = Math.min(4, h, barW / 2);
            const base = PAD.top + innerH;
            const path =
              h <= 0
                ? ''
                : `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`;
            return (
              <g key={d.date}>
                {path && (
                  <path
                    d={path}
                    fill={hover === null || hover === i ? BAR : BAR_DIM}
                    style={{ transition: 'fill 120ms ease' }}
                  />
                )}
                {/* Hit target: the whole column slot, taller and wider than the bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={-1}
                />
                {i % 7 === (data.length - 1) % 7 && (
                  <text
                    x={PAD.left + i * slot + slot / 2}
                    y={H - 8}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.4)"
                    fontSize={10.5}
                  >
                    {fmtDay(d.date, { day: 'numeric', month: 'short' })}
                  </text>
                )}
              </g>
            );
          })}
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + innerH}
            y2={PAD.top + innerH}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1}
          />
        </svg>
        {hovered && hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-[10px] border border-white/10 bg-[#12141d]/95 px-3 py-2 text-center shadow-xl backdrop-blur"
            style={{
              left: Math.min(Math.max(PAD.left + hover * slot + slot / 2, 60), width - 60),
              top: Math.max(0, y(hovered.views) - 58),
            }}
          >
            <p className="text-[11px] text-white/55">
              {fmtDay(hovered.date, { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <p className="text-sm font-semibold text-white">
              {hovered.views.toLocaleString('en-NG')} {hovered.views === 1 ? 'view' : 'views'}
            </p>
          </div>
        )}
      </div>
      <details className="mt-2 text-[12px] text-white/50">
        <summary className="cursor-pointer select-none hover:text-white/75">View as table</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead>
            <tr className="text-white/40">
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 text-right font-medium">Views</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.date} className="border-t border-white/5 text-white/70">
                <td className="py-1">
                  {fmtDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                </td>
                <td className="py-1 text-right tabular-nums">{d.views.toLocaleString('en-NG')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
