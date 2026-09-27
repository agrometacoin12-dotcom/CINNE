'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CoinLedgerEntry, WalletSummary } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError, formatCoins, formatNaira, newIdempotencyKey } from '@/lib/api';

/**
 * Coin wallet. 1 coin = ₦1. Buy coins (Paystack), send them to other viewers,
 * and see every movement — top-ups, pool funding, refunds (always coins) and
 * payouts.
 */

const QUICK_BUYS = [1_000, 2_500, 5_000, 10_000];
const MIN_TOPUP = 100;

const KIND_LABEL: Record<CoinLedgerEntry['kind'], string> = {
  TOPUP: 'Bought coins',
  POOL_FUND: 'Funded',
  POOL_REFUND: 'Refund from',
  POOL_PAYOUT: 'Payout from',
  TRANSFER_OUT: 'Sent to',
  TRANSFER_IN: 'Received from',
};

function entryTitle(e: CoinLedgerEntry): string {
  const who = e.poolName ?? e.counterparty;
  return who ? `${KIND_LABEL[e.kind]} ${who}` : KIND_LABEL[e.kind];
}

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function Wallet() {
  const [data, setData] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [buyAmount, setBuyAmount] = useState('');
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const [to, setTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [note, setNote] = useState('');
  const [sendKey, setSendKey] = useState(newIdempotencyKey);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    api
      .wallet()
      .then(setData)
      .catch((e) => setError(errText(e, 'Could not load your wallet')));
  }, []);
  useEffect(load, [load]);

  const buy = async (coins: number) => {
    setBuyError(null);
    if (!Number.isInteger(coins) || coins < MIN_TOPUP) {
      setBuyError(`Buy at least ${formatCoins(MIN_TOPUP)}`);
      return;
    }
    setBuying(true);
    try {
      const r = await api.buyCoins(coins);
      if (r.authorizationUrl) window.location.href = r.authorizationUrl;
      else load();
    } catch (e) {
      setBuyError(errText(e, 'Could not start payment'));
    } finally {
      setBuying(false);
    }
  };

  const send = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSendMsg(null);
    const coins = Number(sendAmount);
    if (!Number.isInteger(coins) || coins < 1) {
      setSendMsg({ tone: 'error', text: 'Enter a whole number of coins' });
      return;
    }
    setSending(true);
    try {
      const r = await api.sendCoins({
        recipientEmail: to.trim(),
        coins,
        idempotencyKey: sendKey,
        note: note.trim() || undefined,
      });
      setSendMsg({ tone: 'success', text: `Sent ${formatCoins(r.coins)} to ${r.recipient}` });
      setTo('');
      setSendAmount('');
      setNote('');
      setSendKey(newIdempotencyKey()); // next send is a new transfer
      load();
    } catch (e) {
      setSendMsg({ tone: 'error', text: errText(e, 'Could not send coins') });
    } finally {
      setSending(false);
    }
  };

  const balance = data?.balance ?? 0;

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white">Wallet</h1>
        {error && <Alert tone="error">{error}</Alert>}

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-white/55">Balance</p>
          <p className="mt-1 text-4xl font-bold text-white">{data ? formatCoins(balance) : '—'}</p>
          <p className="mt-1 text-sm text-white/55">Worth {formatNaira(balance)} · 1 coin = ₦1</p>
          <Link href="/fund" className="mt-4 inline-block">
            <Button variant="glass">Fund a film</Button>
          </Link>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Buy coins</h2>
          <p className="mt-1 text-sm text-white/55">
            Pay with card, transfer or USSD via Paystack.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_BUYS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={buying}
                onClick={() => void buy(c)}
                className="min-h-[48px] rounded-xl border border-white/12 bg-white/[0.05] px-3 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                {formatNaira(c)}
              </button>
            ))}
          </div>
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void buy(Number(buyAmount));
            }}
          >
            <div className="flex-1">
              <TextField
                label="Other amount (coins)"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 7500"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <Button type="submit" loading={buying} disabled={!buyAmount}>
              {buyAmount ? `Pay ${formatNaira(Number(buyAmount))}` : 'Pay'}
            </Button>
          </form>
          {buyError && <p className="mt-2 text-sm text-red-400">{buyError}</p>}
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Send coins</h2>
          <p className="mt-1 text-sm text-white/55">
            To anyone with a CinneTemple account. Transfers are instant and can’t be reversed.
          </p>
          <form className="mt-4 grid gap-3" onSubmit={send}>
            <TextField
              label="Their CinneTemple email"
              type="email"
              autoComplete="off"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <TextField
              label="Coins"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              hint={sendAmount ? `= ${formatNaira(Number(sendAmount))}` : undefined}
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value.replace(/\D/g, ''))}
            />
            <TextField
              label="Note (optional)"
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {sendMsg && <Alert tone={sendMsg.tone}>{sendMsg.text}</Alert>}
            <Button type="submit" loading={sending} disabled={!to || !sendAmount}>
              Send {sendAmount ? formatCoins(Number(sendAmount)) : 'coins'}
            </Button>
          </form>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">Activity</h2>
          <div className="grid gap-2">
            {data?.entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{entryTitle(e)}</p>
                  <p className="truncate text-xs text-white/50">
                    {new Date(e.createdAt).toLocaleString('en-NG')}
                    {e.note ? ` · “${e.note}”` : ''}
                  </p>
                </div>
                <p
                  className={`whitespace-nowrap text-sm font-semibold ${e.delta > 0 ? 'text-emerald-300' : 'text-white/80'}`}
                >
                  {e.delta > 0 ? '+' : '−'}
                  {Math.abs(e.delta).toLocaleString('en-NG')}
                </p>
              </div>
            ))}
            {data && data.entries.length === 0 && (
              <p className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/55">
                No coin activity yet. Buy some coins to fund a film.
              </p>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

export default function WalletPage() {
  return (
    <RequireAuth>
      <Wallet />
    </RequireAuth>
  );
}
