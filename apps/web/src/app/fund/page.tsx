'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { FundingPool, FundingPoolDetail } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError, formatCoins, formatNaira, newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { gradientCss } from '@/lib/poster';

/**
 * Fund a film with coins (1 coin = ₦1). `/fund` lists pools; `/fund?id=` is one
 * pool: fund it from your wallet, claim your stake back (as coins) while it's
 * open, and see your payout once it's paid out.
 */

const STATUS_LABEL: Record<FundingPool['status'], string> = {
  OPEN: 'Open',
  CLOSED: 'Funding closed',
  PAID_OUT: 'Paid out',
  CANCELLED: 'Cancelled',
};

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function Progress({ pool }: { pool: FundingPool }) {
  const pct = pool.goalCoins ? Math.min(100, (pool.totalCoins / pool.goalCoins) * 100) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-white">{formatNaira(pool.totalCoins)} raised</span>
        <span className="text-white/55">
          {pool.goalCoins ? `of ${formatNaira(pool.goalCoins)}` : 'no cap'} · {pool.backers}{' '}
          {pool.backers === 1 ? 'backer' : 'backers'}
        </span>
      </div>
      {pct !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#6c6ffc]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function PoolList() {
  const [pools, setPools] = useState<FundingPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .fundingPools()
      .then(setPools)
      .catch((e) => setError(errText(e, 'Could not load films')));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-white">Fund a film</h1>
      <p className="mt-2 text-white/60">
        Back Nigerian films with coins. When a film pays out, every coin you put in earns its share.
      </p>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-6 grid gap-3">
        {pools?.map((p) => (
          <Link
            key={p.id}
            href={`/fund?id=${p.id}`}
            className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
          >
            <div
              className="h-20 w-14 flex-shrink-0 rounded-lg"
              style={{ background: gradientCss(p.id) }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-white">{p.name}</p>
                <span className="whitespace-nowrap text-xs text-white/55">
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <div className="mt-3">
                <Progress pool={p} />
              </div>
            </div>
          </Link>
        ))}
        {pools && pools.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] py-12 text-center text-white/60">
            No films are raising right now. Check back soon.
          </p>
        )}
      </div>
    </main>
  );
}

function PoolDetail({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const [pool, setPool] = useState<FundingPoolDetail | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [fundKey, setFundKey] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState<'fund' | 'refund' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);

  const load = useCallback(() => {
    api
      .fundingPool(id, !!user)
      .then(setPool)
      .catch((e) => setError(errText(e, 'Could not load this film')));
    if (user)
      api
        .wallet()
        .then((w) => setBalance(w.balance))
        .catch(() => undefined);
  }, [id, user]);
  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const fund = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setMsg(null);
    const coins = Number(amount);
    if (!Number.isInteger(coins) || coins < 1) {
      setMsg({ tone: 'error', text: 'Enter a whole number of coins' });
      return;
    }
    setBusy('fund');
    try {
      setPool(await api.fundPool(id, coins, fundKey));
      setMsg({
        tone: 'success',
        text: `You put ${formatCoins(coins)} into ${pool?.name ?? 'this film'}`,
      });
      setAmount('');
      setFundKey(newIdempotencyKey());
      api
        .wallet()
        .then((w) => setBalance(w.balance))
        .catch(() => undefined);
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e, 'Could not fund this film') });
    } finally {
      setBusy(null);
    }
  };

  const refund = async () => {
    setMsg(null);
    setBusy('refund');
    try {
      const r = await api.claimPoolRefund(id);
      setPool(r.pool);
      setConfirmRefund(false);
      setMsg({ tone: 'success', text: `${formatCoins(r.refundedCoins)} returned to your wallet` });
      api
        .wallet()
        .then((w) => setBalance(w.balance))
        .catch(() => undefined);
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e, 'Could not process your refund') });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-8">
        <Alert tone="error">{error}</Alert>
      </main>
    );
  }
  if (!pool) return null;

  const stake = pool.myStake;
  const short = balance !== null && Number(amount) > balance;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6">
      <Link href="/fund" className="text-sm text-white/55 hover:text-white">
        ← All films
      </Link>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-white">{pool.name}</h1>
        <span className="mt-2 whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
          {STATUS_LABEL[pool.status]}
        </span>
      </div>
      {pool.description && (
        <p className="mt-3 whitespace-pre-line text-white/70">{pool.description}</p>
      )}

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <Progress pool={pool} />
        {pool.closesAt && pool.status === 'OPEN' && (
          <p className="mt-3 text-xs text-white/55">
            Closes {new Date(pool.closesAt).toLocaleString('en-NG')}
          </p>
        )}
        {pool.status === 'PAID_OUT' && pool.nairaPerCoin && (
          <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Paid out {formatNaira(pool.payoutCoins ?? 0)} · each coin earned ₦{pool.nairaPerCoin}
          </p>
        )}
      </section>

      {stake && stake.contributedCoins > 0 && (
        <section className="mt-4 rounded-2xl border border-[#6c6ffc]/30 bg-[#6c6ffc]/10 p-5">
          <p className="text-sm text-white/60">Your stake</p>
          <p className="mt-1 text-2xl font-bold text-white">{formatCoins(stake.coins)}</p>
          {stake.refundedCoins > 0 && (
            <p className="text-xs text-white/55">
              {formatCoins(stake.refundedCoins)} refunded to your wallet
            </p>
          )}
          {stake.payoutCoins !== null && (
            <p className="mt-2 text-sm font-semibold text-emerald-300">
              Payout: {formatCoins(stake.payoutCoins)} credited to your wallet
            </p>
          )}
          {pool.status === 'OPEN' && stake.coins > 0 && (
            <div className="mt-4">
              {confirmRefund ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-white/75">
                    Return {formatCoins(stake.coins)} to your wallet?
                  </span>
                  <Button
                    variant="primary"
                    loading={busy === 'refund'}
                    onClick={() => void refund()}
                  >
                    Yes, refund
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRefund(false)}>
                    Keep it in
                  </Button>
                </div>
              ) : (
                <Button variant="glass" onClick={() => setConfirmRefund(true)}>
                  Claim refund (as coins)
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {msg && (
        <div className="mt-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}

      {pool.status === 'OPEN' && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Put coins in</h2>
          {!user ? (
            <Link
              href={`/login?next=${encodeURIComponent(`/fund?id=${id}`)}`}
              className="mt-3 inline-block"
            >
              <Button variant="primary">Sign in to fund</Button>
            </Link>
          ) : (
            <form className="mt-3 grid gap-3" onSubmit={fund}>
              <TextField
                label="Coins"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                hint={balance !== null ? `Wallet: ${formatCoins(balance)}` : undefined}
                error={short ? 'Not enough coins in your wallet' : undefined}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={busy === 'fund'} disabled={!amount || short}>
                  Fund {amount ? formatCoins(Number(amount)) : ''}
                </Button>
                {short || balance === 0 ? (
                  <Link href="/wallet">
                    <Button type="button" variant="glass">
                      Buy coins
                    </Button>
                  </Link>
                ) : null}
              </div>
              <p className="text-xs text-white/50">
                You can claim your coins back while funding is open. Refunds always return as coins.
              </p>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

function Fund() {
  const id = useSearchParams().get('id');
  return <AppShell>{id ? <PoolDetail id={id} /> : <PoolList />}</AppShell>;
}

export default function FundPage() {
  return (
    <Suspense fallback={null}>
      <Fund />
    </Suspense>
  );
}
