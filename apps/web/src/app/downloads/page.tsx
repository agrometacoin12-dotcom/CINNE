'use client';

import Link from 'next/link';
import { MobileShell } from '@/components/app/MobileShell';

/** Downloads — exact Figma (node 42:14645): heading + centered empty state with a
 *  glass circle, copy, and an indigo "Find something to download" button. */
export default function DownloadsPage() {
  return (
    <MobileShell showTopBar={false}>
      <h1 className="font-readex text-[26px] font-bold text-white">Downloads</h1>

      <div className="mt-24 flex flex-col items-center text-center">
        <span className="h-[110px] w-[110px] rounded-full lg-glass" />
        <p className="mt-6 text-[16px] text-white">No downloads yet</p>
        <p className="mt-2 max-w-[260px] text-[13px] text-white/55">
          Movies and shows you download appear here for offline watching.
        </p>
        <Link href="/browse" className="lg-glass-indigo-35 mt-6 rounded-[12px] px-6 py-3 text-[14px] font-semibold text-white">
          Find something to download
        </Link>
      </div>
    </MobileShell>
  );
}
