'use client';

import { useEffect, useState } from 'react';
import type { TitleProducer } from '@cinnetemple/shared';
import { api, ApiError } from '@/lib/api';

/**
 * Movie editor → Producer. After upload, the admin enters the producer's email;
 * they get a private dashboard link (views, earnings, naira withdrawals).
 * Re-sending rotates the link, so it also revokes a leaked one.
 */

const inputCls =
  'lg-input h-11 w-full rounded-[12px] px-4 text-[13.5px] text-white placeholder:text-white/40 outline-none';
const labelCls = 'flex flex-col gap-2 text-[12.5px] font-semibold text-white/70';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ProducerPanel({ titleId }: { titleId: string }) {
  const [current, setCurrent] = useState<TitleProducer | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [share, setShare] = useState('90');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'send' | 'resend' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminTitleProducer(titleId)
      .then((r) => {
        setCurrent(r.producer);
        if (r.producer) {
          setEmail(r.producer.email);
          setName(r.producer.name ?? '');
          setShare(String(r.producer.revenueShareBps / 100));
        }
      })
      .catch((e) => setError(errText(e, 'Could not load the producer')));
  }, [titleId]);

  const shareBps = Math.round(Number(share) * 100);
  const shareOk = Number.isFinite(shareBps) && shareBps >= 0 && shareBps <= 10_000;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('send');
    setError(null);
    setNotice(null);
    try {
      const p = await api.adminAssignProducer(titleId, {
        email: email.trim(),
        name: name.trim() || undefined,
        revenueShareBps: shareBps,
      });
      setCurrent(p);
      setEditing(false);
      setNotice(`Dashboard link sent to ${p.email}.`);
    } catch (err) {
      setError(errText(err, 'Could not send the link'));
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy('resend');
    setError(null);
    setNotice(null);
    try {
      const p = await api.adminResendProducerLink(titleId);
      setCurrent(p);
      setNotice(`New link sent to ${p.email}. The previous link no longer works.`);
    } catch (err) {
      setError(errText(err, 'Could not resend the link'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="lg-glass rounded-[18px] p-6"
      style={{ background: 'rgba(214,214,214,0.06)' }}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-readex text-lg font-semibold text-white">Producer</h2>
          <p className="mt-1 text-[12.5px] text-white/55">
            They get a private dashboard with views and earnings, and can withdraw to their bank.
          </p>
        </div>
        {current && !editing && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
            Linked
          </span>
        )}
      </div>

      {current === undefined && !error && <p className="text-sm text-white/45">Loading…</p>}

      {current && !editing ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-[14px] bg-black/20 p-4 text-[13px] sm:grid-cols-3">
            <div>
              <p className="text-white/45">Producer</p>
              <p className="mt-0.5 truncate font-semibold text-white">
                {current.name ?? current.email}
              </p>
              {current.name && <p className="truncate text-white/55">{current.email}</p>}
            </div>
            <div>
              <p className="text-white/45">Share of net ticket revenue</p>
              <p className="mt-0.5 font-semibold text-white">{current.revenueShareBps / 100}%</p>
            </div>
            <div>
              <p className="text-white/45">Link</p>
              <p className="mt-0.5 text-white">Sent {ago(current.linkSentAt)}</p>
              <p className="text-white/55">
                {current.lastSeenAt ? `Opened ${ago(current.lastSeenAt)}` : 'Not opened yet'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={busy !== null}
              className="lg-glass-indigo-35 h-11 rounded-[12px] px-5 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy === 'resend' ? 'Sending…' : 'Resend link'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="lg-glass h-11 rounded-[12px] px-5 text-[13.5px] font-semibold text-white/80"
            >
              Change producer or share
            </button>
          </div>
        </div>
      ) : current !== undefined ? (
        <form onSubmit={send} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              Producer email
              <input
                type="email"
                required
                className={inputCls}
                placeholder="producer@studio.ng"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={labelCls}>
              Name (optional)
              <input
                className={inputCls}
                placeholder="e.g. Kunle Afolayan"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
          <label className={`${labelCls} sm:max-w-[240px]`}>
            Producer share of net ticket revenue (%)
            <input
              inputMode="decimal"
              className={inputCls}
              value={share}
              onChange={(e) => setShare(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </label>
          {!shareOk && (
            <p className="text-[12.5px] text-red-300">Share must be between 0 and 100%.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy !== null || !email || !shareOk}
              className="lg-glass-indigo-35 h-11 rounded-[12px] px-5 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy === 'send'
                ? 'Sending…'
                : current
                  ? 'Save & send new link'
                  : 'Send dashboard link'}
            </button>
            {current && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="lg-glass h-11 rounded-[12px] px-5 text-[13.5px] font-semibold text-white/80"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : null}

      {notice && (
        <p className="mt-4 rounded-[12px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-[12.5px] text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-[12px] border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-[12.5px] text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
