'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProducerDashboard } from '@cinnetemple/shared';
import { api, ApiError, formatKobo } from '@/lib/api';

/**
 * Two-step naira withdrawal: amount + bank details → 6-digit code emailed to
 * the producer → confirmed into the CinneTemple payout queue.
 */

const BANKS = [
  'Access Bank',
  'Citibank',
  'Ecobank',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'FCMB',
  'Globus Bank',
  'GTBank',
  'Jaiz Bank',
  'Keystone Bank',
  'Kuda',
  'Lotus Bank',
  'Moniepoint MFB',
  'OPay',
  'Optimus Bank',
  'PalmPay',
  'Parallex Bank',
  'Polaris Bank',
  'PremiumTrust Bank',
  'Providus Bank',
  'Signature Bank',
  'Stanbic IBTC',
  'Standard Chartered',
  'Sterling Bank',
  'SunTrust Bank',
  'Titan Trust Bank',
  'UBA',
  'Union Bank',
  'Unity Bank',
  'Wema Bank',
  'Zenith Bank',
];

const field =
  'h-12 w-full rounded-[12px] border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:border-[#8a8cff]/70 focus:bg-white/[0.06]';
const label = 'grid gap-1.5 text-[12.5px] font-medium text-white/60';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function WithdrawSheet({
  producerKey,
  data,
  onClose,
  onDone,
}: {
  producerKey: string;
  data: ProducerDashboard;
  onClose: () => void;
  onDone: (d: ProducerDashboard) => void;
}) {
  const availableNaira = Math.floor(data.balance.availableMinor / 100);
  const minNaira = Math.floor(data.balance.minWithdrawalMinor / 100);
  const [step, setStep] = useState<'details' | 'code' | 'done'>('details');
  const [amount, setAmount] = useState(availableNaira >= minNaira ? String(availableNaira) : '');
  const [bankName, setBankName] = useState(data.lastBank?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(data.lastBank?.accountNumber ?? '');
  const [accountName, setAccountName] = useState(data.lastBank?.accountName ?? '');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const amt = Number(amount);
  const amountError =
    amount && amt < minNaira
      ? `Minimum is ₦${minNaira.toLocaleString('en-NG')}`
      : amt > availableNaira
        ? `You can withdraw up to ₦${availableNaira.toLocaleString('en-NG')}`
        : null;
  const detailsOk =
    amt >= minNaira &&
    !amountError &&
    bankName.trim().length >= 2 &&
    /^\d{10}$/.test(accountNumber) &&
    accountName.trim().length >= 2;

  const submitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailsOk) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.producerRequestWithdrawal(producerKey, {
        amountNaira: amt,
        bankName: bankName.trim(),
        accountNumber,
        accountName: accountName.trim(),
      });
      setPendingId(r.id);
      setStep('code');
    } catch (err) {
      setError(errText(err, 'Could not start the withdrawal'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api.producerConfirmWithdrawal(producerKey, pendingId, code);
      setStep('done');
      onDone(d);
    } catch (err) {
      setError(errText(err, 'Could not confirm the code'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-[28px] border border-white/10 bg-gradient-to-b from-[#161826] to-[#0d0e15] p-6 shadow-2xl sm:rounded-[28px] sm:p-8"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

        {step === 'details' && (
          <form onSubmit={submitDetails} className="grid gap-5">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#e6c878]">
                Withdraw
              </p>
              <h2 id="withdraw-title" className="mt-1 font-readex text-2xl font-bold text-white">
                Send to your bank
              </h2>
              <p className="mt-1 text-[13.5px] text-white/55">
                Available:{' '}
                <span className="font-semibold text-white">
                  {formatKobo(data.balance.availableMinor)}
                </span>
              </p>
            </div>

            <label className={label}>
              Amount (₦)
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-white/40">
                  ₦
                </span>
                <input
                  className={`${field} pl-9 pr-16 font-readex text-lg font-semibold tabular-nums`}
                  inputMode="numeric"
                  value={amount ? Number(amount).toLocaleString('en-NG') : ''}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="0"
                  aria-invalid={!!amountError}
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(availableNaira))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[9px] bg-white/[0.08] px-3 py-1.5 text-[12px] font-semibold text-white/80 hover:bg-white/[0.14]"
                >
                  Max
                </button>
              </div>
              {amountError && <span className="text-[12px] text-red-300">{amountError}</span>}
            </label>

            <label className={label}>
              Bank
              <input
                className={field}
                list="ng-banks"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Start typing your bank"
                autoComplete="off"
              />
              <datalist id="ng-banks">
                {BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className={label}>
                Account number
                <input
                  className={`${field} font-mono tracking-wider`}
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10 digits"
                />
              </label>
              <label className={label}>
                Account name
                <input
                  className={field}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="As on your bank account"
                />
              </label>
            </div>

            {error && (
              <p className="rounded-[12px] bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
                {error}
              </p>
            )}

            <div className="grid gap-2">
              <button
                type="submit"
                disabled={!detailsOk || busy}
                className="h-12 rounded-[14px] bg-gradient-to-r from-[#e6c878] to-[#c9a24e] text-[15px] font-semibold text-[#1a1406] shadow-[0_8px_30px_-8px_rgba(230,200,120,0.5)] transition hover:brightness-105 disabled:opacity-40 disabled:shadow-none"
              >
                {busy ? 'Sending code…' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 text-[14px] text-white/55 hover:text-white"
              >
                Cancel
              </button>
            </div>
            <p className="text-center text-[11.5px] leading-relaxed text-white/40">
              We’ll email a 6-digit code to {data.producer.email} to confirm it’s you.
            </p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitCode} className="grid gap-5">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#e6c878]">
                Confirm
              </p>
              <h2 id="withdraw-title" className="mt-1 font-readex text-2xl font-bold text-white">
                Check your email
              </h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">
                Enter the code we sent to <span className="text-white">{data.producer.email}</span>{' '}
                to withdraw{' '}
                <span className="font-semibold text-white">₦{amt.toLocaleString('en-NG')}</span> to{' '}
                {accountName}, {bankName}.
              </p>
            </div>
            <input
              ref={codeRef}
              className={`${field} h-16 text-center font-readex text-3xl font-bold tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              aria-label="6-digit code"
            />
            {error && (
              <p className="rounded-[12px] bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={code.length !== 6 || busy}
              className="h-12 rounded-[14px] bg-gradient-to-r from-[#e6c878] to-[#c9a24e] text-[15px] font-semibold text-[#1a1406] transition hover:brightness-105 disabled:opacity-40"
            >
              {busy ? 'Confirming…' : 'Confirm withdrawal'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('details');
                setCode('');
                setError(null);
              }}
              className="h-10 text-[13.5px] text-white/55 hover:text-white"
            >
              ← Change details
            </button>
            <p className="text-center text-[11.5px] text-white/40">
              The code expires in 10 minutes.
            </p>
          </form>
        )}

        {step === 'done' && (
          <div className="grid justify-items-center gap-4 py-4 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-3xl text-emerald-300">
              ✓
            </div>
            <h2 id="withdraw-title" className="font-readex text-2xl font-bold text-white">
              Withdrawal requested
            </h2>
            <p className="max-w-xs text-[13.5px] leading-relaxed text-white/60">
              ₦{amt.toLocaleString('en-NG')} to {accountName}, {bankName}. We’ll email you as soon
              as the transfer is sent.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 h-12 w-full rounded-[14px] border border-white/12 bg-white/[0.06] text-[15px] font-semibold text-white hover:bg-white/[0.1]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
