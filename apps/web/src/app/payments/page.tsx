'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/app/MobileShell';

/**
 * Payments — exact Figma web frame 42:15103 on desktop (plans + unlock list on
 * the left, 528px "Payment Details" glass card with Bank Transfer / Card
 * Payment tabs on the right) and iPhone frames 42:15375 / 42:15449 on mobile
 * (two-step flow). The card form is presentational — real payments route
 * through Paystack / IAP.
 */
const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly Plan',
    desc: 'The Wolf of Wall Street is ready to watch offline',
    price: '$12/Month',
  },
  {
    id: 'lifetime',
    name: 'Lifetime offer',
    desc: 'Pay once, watch forever — 40% off today only',
    price: '',
    promo: true,
  },
  {
    id: 'quarterly',
    name: 'Quarterly Plan',
    desc: 'The Wolf of Wall Street is ready to watch offline',
    price: '$12/Quarter',
  },
  {
    id: 'annual',
    name: 'Annual Plan',
    desc: 'The Wolf of Wall Street is ready to watch offline',
    price: '$12/Year',
  },
];

const UNLOCK = [
  'Unlimited access to all movies and shows, anytime',
  'Watch without ads for an uninterrupted experience',
  'Exclusive early releases and bonus content',
  'Download favorites for offline viewing',
  'One-time payment with no recurring fees',
  'Priority customer support whenever you need it',
];

export default function PaymentsPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [plan, setPlan] = useState('lifetime');
  const [method, setMethod] = useState<'bank' | 'card'>('card');

  const input =
    'lg-input h-12 w-full rounded-[12px] px-[18px] text-[13.5px] text-white placeholder:text-white/50 outline-none';

  /* Plans + unlock list — 42:15219 / 42:15252 */
  const plansPanel = (
    <div>
      <div className="flex flex-col gap-4 lg:max-w-[480px]">
        {PLANS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlan(p.id)}
            className="lg-glass relative flex h-[78px] items-center gap-3 rounded-[14px] px-3.5 text-left"
            style={{
              background:
                p.promo || plan === p.id ? 'rgba(99,102,241,0.18)' : 'rgba(214,214,214,0.07)',
            }}
          >
            <span
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[20px]"
              style={
                p.promo
                  ? { background: 'rgba(99,102,241,0.4)' }
                  : { border: `5px solid ${plan === p.id ? '#6c6ffc' : '#fff'}` }
              }
            >
              {p.promo && <span className="text-white/90">★</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-white">{p.name}</span>
              <span className="block truncate text-[11.5px] leading-[1.4] text-white/60">
                {p.desc}
              </span>
            </span>
            {p.price && <span className="pr-1 text-xs font-semibold text-white">{p.price}</span>}
          </button>
        ))}
      </div>

      <h3 className="mt-10 font-readex text-xl font-semibold text-white">
        Here&apos;s what you&apos;ll unlock
      </h3>
      <div className="mt-4 max-w-[421px] text-[14px] leading-[1.7] text-white/70">
        {UNLOCK.map((u) => (
          <p key={u}>- {u}</p>
        ))}
      </div>
    </div>
  );

  /* Payment Details card — 42:15255 */
  const detailsPanel = (
    <div
      className="lg-glass rounded-[22px] px-6 pb-10 pt-10 sm:px-10 lg:w-[528px]"
      style={{ background: 'rgba(214,214,214,0.1)' }}
    >
      <h3 className="font-readex text-[28px] font-bold leading-none text-white">Payment Details</h3>
      <div className="mt-[26px] flex gap-[26px]">
        {(['bank', 'card'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`relative pb-2 text-sm font-semibold ${method === m ? 'text-white' : 'text-white/60'}`}
          >
            {m === 'bank' ? 'Bank Transfer' : 'Card Payment'}
            {method === m && (
              <span className="absolute -bottom-px left-0 h-1 w-full rounded-t-[4px] bg-[#6c6ffc]" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-[18px] flex flex-col gap-[26px]">
        {method === 'card' ? (
          <>
            <Field label="Billed to">
              <input className={input} placeholder="Your name" />
            </Field>
            <Field label="Card Holder's Name">
              <input className={input} placeholder="Your name" />
            </Field>
            <Field label="Card Number">
              <input className={input} placeholder="XXXX XXXX XXXX XXXX" inputMode="numeric" />
            </Field>
            <Field label="CVV">
              <input className={input} placeholder="•••" inputMode="numeric" />
            </Field>
            <Field label="Expiry Date">
              <input className={input} placeholder="MM/YY" />
            </Field>
          </>
        ) : (
          <div className="rounded-[12px] lg-glass px-4 py-6 text-center text-[13px] text-white/70">
            Transfer to the account shown after you tap Proceed. We&apos;ll confirm automatically.
          </div>
        )}
      </div>

      <div className="mt-9 flex items-center justify-between text-xs font-semibold text-white">
        <span>Total to be Billed</span>
        <span>$12/Year</span>
      </div>
      <button
        onClick={() => router.push('/browse')}
        className="lg-glass-indigo-35 mt-4 flex h-[50px] w-full items-center justify-center rounded-[12px] text-[15px] font-semibold text-white"
      >
        Proceed
      </button>
    </div>
  );

  return (
    <MobileShell>
      {/* Mobile header — 42:15375 */}
      <div className="mb-6 flex items-center justify-between pt-2 lg:hidden">
        <button
          onClick={() => (step === 2 ? setStep(1) : router.back())}
          aria-label="Back"
          className="lg-glass grid h-10 w-10 place-items-center rounded-[20px] text-lg text-white"
        >
          ←
        </button>
        <h1 className="font-readex text-[20px] font-bold text-white">Payments</h1>
        <span className="w-10" />
      </div>

      <h2 className="pt-2 font-readex text-[18px] font-semibold text-white/90 lg:text-[24px]">
        Activate Your CinneTemple Subscription
      </h2>

      {/* Desktop: both panels side by side — 42:15103 */}
      <div className="mt-6 hidden gap-14 lg:flex">
        <div className="flex-1">{plansPanel}</div>
        {detailsPanel}
      </div>

      {/* Mobile: two-step flow — 42:15375 / 42:15449 */}
      <div className="mt-5 lg:hidden">
        {step === 1 ? (
          <>
            {plansPanel}
            <button
              onClick={() => setStep(2)}
              className="lg-glass-indigo-35 mt-7 flex h-12 w-full items-center justify-center rounded-[12px] text-[14.5px] font-semibold text-white"
            >
              Proceed
            </button>
          </>
        ) : (
          detailsPanel
        )}
      </div>
    </MobileShell>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-[9px] block text-[12.5px] font-semibold text-white/75">{label}</span>
      {children}
    </label>
  );
}
