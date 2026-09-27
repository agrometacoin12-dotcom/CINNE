'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminProducerWithdrawal } from '@cinnetemple/shared';
import { api, ApiError, formatKobo } from '@/lib/api';
import { ConfirmDialog, ErrorNote, Pill, type PillTone } from './ui';

/**
 * Studio → Payouts. Producer withdrawal requests (already confirmed by the
 * producer with an emailed code). Send the bank transfer, then mark it paid
 * with the transfer reference — the producer is emailed either way.
 */

type Filter = 'REQUESTED' | 'PAID' | 'REJECTED';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'REQUESTED', label: 'To pay' },
  { key: 'PAID', label: 'Paid' },
  { key: 'REJECTED', label: 'Declined' },
];
const TONE: Record<Filter, PillTone> = { REQUESTED: 'draft', PAID: 'ok', REJECTED: 'danger' };

const input =
  'lg-glass w-full rounded-[12px] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#6c6ffc]/60';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function Row({ w, onDone }: { w: AdminProducerWithdrawal; onDone: () => void }) {
  const [mode, setMode] = useState<'pay' | 'reject' | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'pay') await api.adminMarkWithdrawalPaid(w.id, value.trim());
      else await api.adminRejectWithdrawal(w.id, value.trim());
      setMode(null);
      onDone();
    } catch (e) {
      setError(errText(e, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(w.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the number is visible anyway */
    }
  };

  return (
    <div className="lg-glass rounded-[16px] p-4" style={{ background: 'rgba(214,214,214,0.06)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-readex text-xl font-bold text-white">{formatKobo(w.amountMinor)}</p>
            <Pill tone={TONE[w.status]}>{FILTERS.find((f) => f.key === w.status)?.label}</Pill>
          </div>
          <p className="mt-1 truncate text-[13px] text-white/70">
            {w.producerName ?? w.producerEmail}
            {w.producerName && <span className="text-white/45"> · {w.producerEmail}</span>}
          </p>
          <p className="mt-2 text-[13px] text-white">
            {w.accountName} · {w.bankName} ·{' '}
            <button
              type="button"
              onClick={() => void copy()}
              className="font-mono text-[#8082ff] underline-offset-2 hover:underline"
            >
              {w.accountNumber}
            </button>
            {copied && <span className="ml-2 text-[11px] text-emerald-300">copied</span>}
          </p>
          <p className="mt-1 text-[11.5px] text-white/45">
            Requested {w.requestedAt ? new Date(w.requestedAt).toLocaleString('en-NG') : '—'}
            {w.transferRef && ` · ref ${w.transferRef}`}
            {w.note && ` · ${w.note}`}
          </p>
        </div>
        {w.status === 'REQUESTED' && (
          <div className="flex gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setValue('');
                setMode('pay');
              }}
              className="rounded-full bg-emerald-500/20 px-3.5 py-2 text-emerald-300"
            >
              Mark paid
            </button>
            <button
              type="button"
              onClick={() => {
                setValue('');
                setMode('reject');
              }}
              className="rounded-full bg-red-500/15 px-3.5 py-2 text-red-300"
            >
              Decline
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={mode !== null}
        title={
          mode === 'pay'
            ? `Mark ${formatKobo(w.amountMinor)} as paid?`
            : `Decline ${formatKobo(w.amountMinor)}?`
        }
        body={
          <div className="grid gap-3">
            <p>
              {mode === 'pay'
                ? `Only after you've sent the transfer to ${w.accountName} (${w.bankName} ${w.accountNumber}).`
                : 'The amount goes back to the producer’s available balance. They’ll see your reason.'}
            </p>
            <input
              className={input}
              autoFocus
              placeholder={
                mode === 'pay' ? 'Bank / Paystack transfer reference' : 'Reason for the producer'
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        }
        confirmLabel={mode === 'pay' ? 'Mark paid' : 'Decline'}
        danger={mode === 'reject'}
        busy={busy}
        confirmDisabled={value.trim().length < 3}
        error={error}
        onConfirm={() => void submit()}
        onCancel={() => setMode(null)}
      />
    </div>
  );
}

export function PayoutsTab() {
  const [filter, setFilter] = useState<Filter>('REQUESTED');
  const [rows, setRows] = useState<AdminProducerWithdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .adminProducerWithdrawals(filter)
      .then(setRows)
      .catch((e) => setError(errText(e, 'Could not load withdrawals')));
  }, [filter]);
  useEffect(load, [load]);

  const total = rows?.reduce((s, w) => s + w.amountMinor, 0) ?? 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold ${filter === f.key ? 'bg-[#6c6ffc] text-white' : 'bg-white/[0.06] text-white/65'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {rows && rows.length > 0 && (
          <p className="text-[13px] text-white/60">
            {rows.length} {rows.length === 1 ? 'request' : 'requests'} · {formatKobo(total)}
          </p>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {rows?.map((w) => (
        <Row key={w.id} w={w} onDone={load} />
      ))}
      {rows && rows.length === 0 && (
        <p className="py-10 text-center text-sm text-white/50">
          {filter === 'REQUESTED' ? 'No withdrawals waiting to be paid.' : 'Nothing here yet.'}
        </p>
      )}
    </div>
  );
}
