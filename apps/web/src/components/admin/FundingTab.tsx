'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FundingPool, PayoutPlan } from '@cinnetemple/shared';
import { api, ApiError, formatCoins, formatNaira } from '@/lib/api';
import { ConfirmDialog, ErrorNote, Pill, type PillTone } from './ui';

/**
 * Studio → Funding. Open a pool for a film, close it, and set the payout: the
 * preview shows ₦ per coin (payout ÷ pooled coins) and every backer's share
 * before anything is credited. Payout and cancel are final and pay backers in
 * coins.
 */

const STATUS_TONE: Record<FundingPool['status'], PillTone> = {
  OPEN: 'ok',
  CLOSED: 'draft',
  PAID_OUT: 'indigo',
  CANCELLED: 'danger',
};

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const input =
  'lg-glass w-full rounded-[12px] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#6c6ffc]/60';

function CreatePool({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.adminCreatePool({
        name: name.trim(),
        description: description.trim() || undefined,
        goalCoins: goal ? Number(goal) : undefined,
        closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
      });
      setName('');
      setDescription('');
      setGoal('');
      setClosesAt('');
      onCreated();
    } catch (err) {
      setError(errText(err, 'Could not create pool'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="lg-glass grid gap-3 rounded-[16px] p-4"
      style={{ background: 'rgba(214,214,214,0.06)' }}
    >
      <p className="text-sm font-semibold text-white">New funding pool</p>
      <input
        className={input}
        placeholder="Film name"
        required
        minLength={2}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className={`${input} min-h-[72px]`}
        placeholder="What backers are funding (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-white/55">
          Goal in coins (₦) — optional cap
          <input
            className={input}
            inputMode="numeric"
            placeholder="e.g. 5000000"
            value={goal}
            onChange={(e) => setGoal(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <label className="grid gap-1 text-xs text-white/55">
          Closes — optional
          <input
            className={input}
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </label>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button
        type="submit"
        disabled={busy || name.trim().length < 2}
        className="justify-self-start rounded-full bg-[#6c6ffc] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Open pool'}
      </button>
    </form>
  );
}

function PayoutPanel({ pool, onDone }: { pool: FundingPool; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [plan, setPlan] = useState<PayoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Live preview: ₦ per coin and each backer's share, recomputed as the admin types.
  useEffect(() => {
    setPlan(null);
    if (!amount) return;
    const t = setTimeout(() => {
      api
        .adminPreviewPayout(pool.id, Number(amount))
        .then(setPlan)
        .catch((e) => setError(errText(e, 'Could not preview payout')));
    }, 300);
    return () => clearTimeout(t);
  }, [amount, pool.id]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminPayout(pool.id, Number(amount));
      setConfirming(false);
      onDone();
    } catch (e) {
      setError(errText(e, 'Payout failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 grid gap-3 rounded-[12px] bg-black/20 p-3">
      <label className="grid gap-1 text-xs text-white/55">
        Total payout to backers (coins = ₦)
        <input
          className={input}
          inputMode="numeric"
          placeholder="e.g. 7500000"
          value={amount}
          onChange={(e) => {
            setError(null);
            setAmount(e.target.value.replace(/\D/g, ''));
          }}
        />
      </label>
      {plan && (
        <div className="grid gap-2 text-sm">
          <p className="text-white">
            {formatNaira(plan.payoutCoins)} ÷ {formatCoins(plan.totalCoins)} ={' '}
            <span className="font-semibold text-[#8082ff]">₦{plan.nairaPerCoin} per coin</span>
          </p>
          <div className="max-h-56 overflow-auto rounded-[10px] border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#10131c] text-white/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Backer</th>
                  <th className="px-3 py-2 text-right font-medium">Stake</th>
                  <th className="px-3 py-2 text-right font-medium">Gets</th>
                </tr>
              </thead>
              <tbody>
                {plan.backers.map((b) => (
                  <tr key={b.userId} className="border-t border-white/5 text-white/80">
                    <td className="px-3 py-2">{b.name}</td>
                    <td className="px-3 py-2 text-right">{b.coins.toLocaleString('en-NG')}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-300">
                      {b.payoutCoins.toLocaleString('en-NG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.backers.length === 0 && <p className="text-white/55">No backers to pay.</p>}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <button
        type="button"
        disabled={!plan || plan.backers.length === 0}
        onClick={() => setConfirming(true)}
        className="justify-self-start rounded-full bg-[#6c6ffc] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Pay out
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Pay out ${pool.name}?`}
        body={
          plan ? (
            <>
              {formatNaira(plan.payoutCoins)} will be credited as coins to {plan.backers.length}{' '}
              {plan.backers.length === 1 ? 'backer' : 'backers'} at ₦{plan.nairaPerCoin} per coin.
              This is final.
            </>
          ) : null
        }
        confirmLabel="Pay out"
        busy={busy}
        error={error}
        onConfirm={() => void pay()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function PoolRow({ pool, onChanged }: { pool: FundingPool; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'close' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settleable = pool.status === 'OPEN' || pool.status === 'CLOSED';

  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      if (confirm === 'close') await api.adminClosePool(pool.id);
      else if (confirm === 'cancel') await api.adminCancelPool(pool.id);
      setConfirm(null);
      onChanged();
    } catch (e) {
      setError(errText(e, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lg-glass rounded-[16px] p-4" style={{ background: 'rgba(214,214,214,0.06)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-white">{pool.name}</p>
            <Pill tone={STATUS_TONE[pool.status]}>{pool.status.replace('_', ' ')}</Pill>
          </div>
          <p className="mt-1 text-xs text-white/55">
            {formatNaira(pool.totalCoins)} pooled
            {pool.goalCoins ? ` of ${formatNaira(pool.goalCoins)}` : ''} · {pool.backers}{' '}
            {pool.backers === 1 ? 'backer' : 'backers'}
            {pool.status === 'PAID_OUT' && pool.nairaPerCoin
              ? ` · paid ${formatNaira(pool.payoutCoins ?? 0)} (₦${pool.nairaPerCoin}/coin)`
              : ''}
          </p>
        </div>
        {settleable && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-full bg-[#6c6ffc]/20 px-3 py-1.5 text-[#8082ff]"
            >
              {open ? 'Hide payout' : 'Set payout'}
            </button>
            {pool.status === 'OPEN' && (
              <button
                type="button"
                onClick={() => setConfirm('close')}
                className="rounded-full bg-white/10 px-3 py-1.5 text-white/75"
              >
                Close funding
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirm('cancel')}
              className="rounded-full bg-red-500/15 px-3 py-1.5 text-red-300"
            >
              Cancel &amp; refund
            </button>
          </div>
        )}
      </div>
      {open && settleable && <PayoutPanel pool={pool} onDone={onChanged} />}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'close' ? `Close ${pool.name}?` : `Cancel ${pool.name}?`}
        body={
          confirm === 'close'
            ? 'No more coins can go in and backers can no longer claim refunds. You can still pay out or cancel.'
            : `${pool.backers === 1 ? 'The 1 backer gets' : `All ${pool.backers} backers get`} their ${formatNaira(pool.totalCoins)} back as coins. This is final.`
        }
        confirmLabel={confirm === 'close' ? 'Close funding' : 'Cancel & refund'}
        danger={confirm === 'cancel'}
        busy={busy}
        error={error}
        onConfirm={() => void act()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

export function FundingTab() {
  const [pools, setPools] = useState<FundingPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminFundingPools()
      .then(setPools)
      .catch((e) => setError(errText(e, 'Could not load pools')));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="grid gap-4">
      <CreatePool onCreated={load} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {pools?.map((p) => (
        <PoolRow key={p.id} pool={p} onChanged={load} />
      ))}
      {pools && pools.length === 0 && (
        <p className="text-sm text-white/55">No funding pools yet.</p>
      )}
    </div>
  );
}
