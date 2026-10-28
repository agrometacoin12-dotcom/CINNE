/** Local previews only. Never sends email. Run with ts-node scripts/preview-emails.ts. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderEmail } from '../src/modules/auth/email/email-design';
const output = resolve(process.argv[2] || '/tmp/cinne-email-preview');
mkdirSync(output, { recursive: true });
const samples: Record<string, [string, string]> = {
  welcome: ['Welcome to CinneTemple', 'Hello Amara,\n\nYour CinneTemple account is ready. Discover your next movie and make a night of it.\n\nhttps://www.cinnetemple.com'],
  verification: ['Verify your CinneTemple account', 'Welcome to CinneTemple. Enter this code in the app to verify your email address:\n\n482716\n\nIf you did not create an account, you can ignore this email.'],
  reset: ['Reset your CinneTemple password', 'Enter this code in CinneTemple to reset your password:\n\n482716\n\nIf you did not request a password reset, ignore this email. Your password has not been changed.'],
  producer: ['Your CinneTemple producer dashboard — A Night in Lagos', 'Hello Amara,\n\n"A Night in Lagos" is on CinneTemple. Your private dashboard shows its views and your earnings, and lets you withdraw to your bank account:\n\nhttps://www.cinnetemple.com/producer#key=PREVIEW-ONLY\n\nKeep this link private — anyone with it can see your numbers. Withdrawals also need a code we email you. This link replaces any earlier one we sent.'],
  wallet: ['Coin top-up confirmed — CinneTemple', 'Wallet change: 1,000 coins\nBalance after this transaction: 2,500 coins\nReference: preview-transaction-001\nOpen your CinneTemple wallet for full transaction details.'],
  ticket: ['Movie ticket confirmed — CinneTemple', 'A Night in Lagos\nStatus: PAID\nReference: preview-ticket-001\nOpen CinneTemple to check your tickets and viewing access.'],
  upload: ['Episode upload updated — CinneTemple', 'Episode: A new beginning\nVideo attached: Yes\nCheck episode details and playback in CinneTemple Studio.'],
  published: ['Movie published — CinneTemple', 'A Night in Lagos\nCatalogue status: PUBLISHED\nVideo attached: Yes\nReview the movie details and playback in CinneTemple Studio. Attaching a file does not by itself confirm successful playback.'],
  withdrawal: ['Withdrawal submitted for review — CinneTemple', 'Amount: NGN 25000\nStatus: REQUESTED\nReference: preview-withdrawal-001\nCheck your producer dashboard for details. A submitted request is not a completed payout.'],
  code: ['Your CinneTemple withdrawal code: 482716', 'Your code to confirm a withdrawal of ₦25,000 to Amara, Example Bank ****1234 is:\n\n482716\n\nIt expires in 10 minutes. If you did not request this, ignore this email and ask CinneTemple to send you a new dashboard link.'],
  failed: ['Coin top-up unsuccessful — CinneTemple', 'This top-up was not credited. Check your wallet and payment status before retrying. Reference: preview-failed-001'],
  refund: ['Apple purchase refund applied — CinneTemple', 'Wallet change: -500 coins\nBalance after this transaction: 0 coins\nReference: preview-refund-001\nOpen your CinneTemple wallet for full transaction details.'],
};
for (const [name, [subject, text]] of Object.entries(samples)) writeFileSync(resolve(output, `${name}.html`), renderEmail(subject, text));
writeFileSync(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CinneTemple email previews</title><body style="font:18px Arial;background:#eef0f3;padding:32px"><h1>CinneTemple email previews</h1><p>Sample data only · No emails sent</p>${Object.keys(samples).map(name => `<p><a href="${name}.html">${name}</a></p>`).join('')}</body></html>`);
console.log(`Rendered ${Object.keys(samples).length} previews in ${output}`);
