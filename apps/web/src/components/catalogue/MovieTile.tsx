'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TitleSummary } from '@cinnetemple/shared';
import { gradientCss } from '@/lib/poster';

/* eslint-disable @next/next/no-img-element */
/**
 * Movie Tile — Figma component (42:12930 / 42:13928): portrait poster,
 * rounded 12, 1.7px white/35 border, optional indigo-gradient rating pill.
 * Default size 186×263 (Categories/List rows); pass w/h for other scales.
 */
export function MovieTile({
  item,
  w = 186,
  h = 263,
  showRating = false,
}: {
  item: TitleSummary;
  w?: number;
  h?: number;
  showRating?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <Link
      href={`/title?id=${item.id}`}
      className="relative block flex-shrink-0"
      style={{ width: w }}
    >
      <div
        className="relative w-full overflow-hidden rounded-[12px] border-[1.7px] border-white/35 transition hover:border-[#6c6ffc]/70"
        style={{ height: h }}
      >
        {!broken ? (
          <img
            src={item.posterUrl ?? `/art/posters/${item.id}.jpg`}
            alt={item.title}
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center p-2 text-center text-xs font-semibold text-white"
            style={{ background: gradientCss(item.id) }}
          >
            {item.title}
          </div>
        )}
      </div>
      {showRating && item.rating > 0 && (
        <span
          className="absolute -right-1 top-[5px] flex items-center gap-0.5 rounded-full px-1 py-0.5 text-sm font-medium text-white"
          style={{
            backgroundImage: 'linear-gradient(99deg, rgba(108,111,252,0) 8.77%, #6c6ffc 70.69%)',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" />
          </svg>
          {item.rating.toFixed(1)}
        </span>
      )}
    </Link>
  );
}
