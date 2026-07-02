'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/app/MobileShell';

/** Payments — exact Figma (nodes 42:15375 / 42:15449): plan selection with radios
 *  + unlock list, then a Payment Details form (Bank Transfer / Card Payment tabs).
 *  The card form is presentational — real payments route through Paystack / IAP. */
const PLANS = [
  { id: 'monthly', name: 'Monthly Plan', desc: 'The Wolf of Wall Street is ready…', price: '$12/Month' },
  { id: 'lifetime', name: 'Lifetime offer', desc: 'Pay once, watch forever — 40% off today only', price: '', promo: true },
  { id: 'quarterly', name: 'Quarterly Plan', desc: 'The Wolf of Wall Street is …', price: '$12/Quarter' },
  { id: 'annual', name: 'Annual Plan', desc: 'The Wolf of Wall Street is ready…', price: '$12/Year' },
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

  const input = 'lg-input h-[46px] w-full rounded-[12px] px-4 text-[13px] text-white placeholder:text-white/40 outline-none';

  return (
    <MobileShell showTopBar={false}>
      <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => (step === 2 ? setStep(1) : router.back())} aria-label="Back" className="lg-glass grid h-10 w-10 place-items-center rounded-[20px] text-lg text-white">←</button>
        <h1 className="font-readex text-[20px] font-bold text-white">Payments</h1>
        <span className="w-10" />
      </div>

      <h2 className="font-readex text-[18px] font-bold text-white">Activate Your CinneTemple Subscription</h2>

      {step === 1 ? (
        <>
          <div className="mt-5 flex flex-col gap-3">
            {PLANS.map((p) => (
              <button key={p.id} onClick={() => setPlan(p.id)} className={`flex items-center gap-3 rounded-[14px] px-4 py-3.5 text-left ${plan === p.id ? 'lg-glass-indigo' : 'lg-glass'}`}>
                <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 ${plan === p.id ? 'border-white' : 'border-white/50'}`}>
                  {plan === p.id && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-white">{p.name}</span>
                  <span className="block truncate text-[12px] text-white/55">{p.desc}</span>
                </span>
                {p.price && <span className="text-[12px] text-white/70">{p.price}</span>}
              </button>
            ))}
          </div>

          <h3 className="mt-7 font-readex text-[15px] font-semibold text-white">Here&apos;s what you&apos;ll unlock</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {UNLOCK.map((u) => (
              <li key={u} className="flex gap-2 text-[13px] text-white/70"><span className="text-[#6c6ffc]">•</span>{u}</li>
            ))}
          </ul>

          <button onClick={() => setStep(2)} className="lg-glass-indigo-35 mt-7 flex h-12 w-full items-center justify-center rounded-[12px] text-[14.5px] font-semibold text-white">Proceed</button>
        </>
      ) : (
        <>
          <h3 className="mt-5 font-readex text-[16px] font-bold text-white">Payment Details</h3>
          <div className="mt-4 flex gap-6 border-b border-white/10">
            {(['bank', 'card'] as const).map((m) => (
              <button key={m} onClick={() => setMethod(m)} className={`-mb-px border-b-2 pb-2.5 text-[13px] ${method === m ? 'border-[#6c6ffc] font-semibold text-white' : 'border-transparent text-white/50'}`}>
                {m === 'bank' ? 'Bank Transfer' : 'Card Payment'}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {method === 'card' ? (
              <>
                <Field label="Billed to"><input className={input} placeholder="Your name" /></Field>
                <Field label="Card Holder's Name"><input className={input} placeholder="Your name" /></Field>
                <Field label="Card Number"><input className={input} placeholder="XXXX XXXX XXXX XXXX" inputMode="numeric" /></Field>
                <div className="flex gap-4">
                  <Field label="CVV" className="flex-1"><input className={input} placeholder="•••" inputMode="numeric" /></Field>
                  <Field label="Expiry Date" className="flex-1"><input className={input} placeholder="MM/YY" /></Field>
                </div>
              </>
            ) : (
              <div className="rounded-[12px] lg-glass px-4 py-6 text-center text-[13px] text-white/70">
                Transfer to the account shown after you tap Proceed. We&apos;ll confirm automatically.
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-[13px] text-white/60">Total to be Billed</span>
            <span className="text-[13px] font-semibold text-white">$12/Year</span>
          </div>
          <button onClick={() => router.push('/browse')} className="lg-glass-indigo-35 mt-4 flex h-12 w-full items-center justify-center rounded-[12px] text-[14.5px] font-semibold text-white">Proceed</button>
        </>
      )}
      </div>
    </MobileShell>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[12px] font-semibold text-white/75">{label}</span>
      {children}
    </label>
  );
}
