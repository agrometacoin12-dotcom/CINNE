/** Table-based, inline-styled email. No remote images, fonts or tracking pixels. */
const SITE = 'https://www.cinnetemple.com';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function theme(subject: string) {
  if (/verify|password|withdrawal code/i.test(subject)) return { label: 'ACCOUNT & SECURITY', note: 'A secure update for your CinneTemple account.' };
  if (/welcome/i.test(subject)) return { label: 'WELCOME TO CINNETEMPLE', note: 'Your next chapter starts here.' };
  if (/withdrawal|payout|earnings|producer dashboard|ticket activity/i.test(subject)) return { label: 'PRODUCER STUDIO', note: 'An update on your films and earnings.' };
  if (/coin|wallet|funding|refund/i.test(subject)) return { label: 'YOUR COIN WALLET', note: 'Your latest wallet activity, all in one place.' };
  if (/ticket/i.test(subject)) return { label: 'YOUR CINEMA', note: 'An update on your movie ticket.' };
  if (/movie|episode|upload|release|streaming/i.test(subject)) return { label: 'FILMS & SERIES', note: 'The latest update from CinneTemple.' };
  return { label: 'CINNETEMPLE UPDATES', note: 'An update from your cinema.' };
}

function trustedLink(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && ['cinnetemple.com', 'www.cinnetemple.com'].includes(url.hostname) && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Show unknown URLs as text, never as an action. */ }
  return undefined;
}
function linkLabel(url: string): string {
  const path = new URL(url).pathname;
  return path.startsWith('/producer') ? 'Open producer dashboard' : path.startsWith('/wallet') ? 'View your wallet' : 'Visit CinneTemple';
}

/** Preserves every source detail; structured lines become a readable receipt. */
export function renderEmail(subject: string, text: string): string {
  const style = theme(subject);
  const security = style.label === 'ACCOUNT & SECURITY';
  const heading = /withdrawal code/i.test(subject) ? 'Confirm your withdrawal'
    : /^Your CinneTemple producer dashboard/i.test(subject) ? 'Your producer dashboard'
    : /^Verify your CinneTemple account$/i.test(subject) ? 'Verify your email'
    : /^Reset your CinneTemple password$/i.test(subject) ? 'Reset your password'
    : subject.replace(/\s*[—–-]\s*CinneTemple\s*$/i, '');
  const links: string[] = [];
  const prose = (line: string) => escape(line).replace(/https:\/\/[^\s<>]+/g, escapedUrl => {
    // Only the original URL is parsed. Escaping is applied after validation.
    const raw = escapedUrl.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    const url = trustedLink(raw.replace(/[.,;]$/, ''));
    if (!url) return escapedUrl;
    if (!links.includes(url)) links.push(url);
    return `<a href="${escape(url)}" style="color:#8b5b05;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere">${url.includes('#key=') ? 'Your private dashboard link' : escape(url)}</a>`;
  });
  const content = text.split(/\r?\n/).map(raw => {
    const line = raw.trim();
    if (!line) return '';
    if (security && /^\d{6,8}$/.test(line)) return `<tr><td style="padding:12px 0 22px"><div style="background:#f8f3e6;border:1px solid #e8d6a4;border-radius:12px;padding:23px 10px;text-align:center;font-family:Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#17212b">${escape(line)}</div></td></tr>`;
    const field = line.match(/^(Wallet change|Balance after this transaction|Reference|Amount|Status|Catalogue status|Video attached|Episode):\s*(.+)$/i);
    if (field) return `<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;border-radius:8px"><tr><td style="padding:13px 16px"><div style="font-size:11px;line-height:17px;letter-spacing:1px;text-transform:uppercase;color:#65717d">${escape(field[1]!)}</div><div style="font-size:${/reference/i.test(field[1]!) ? '13' : '19'}px;line-height:27px;font-weight:600;color:#17212b;word-break:break-word;overflow-wrap:anywhere">${escape(field[2]!)}</div></td></tr></table></td></tr>`;
    return `<tr><td style="padding:0 0 18px;font-size:16px;line-height:26px;color:#485361;overflow-wrap:anywhere;word-break:break-word">${prose(line)}</td></tr>`;
  }).join('');
  if (!links.length && !security && /coin|wallet|funding|refund/i.test(subject)) links.push(`${SITE}/wallet/`);
  const hasCode = security && /(?:^|\n)\s*\d{6,8}\s*(?:\n|$)/.test(text);
  const actions = links.slice(0, 1).map(url => `<tr><td style="padding:10px 0 26px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#edbd55" style="border-radius:8px;text-align:center"><a href="${escape(url)}" style="display:inline-block;border:1px solid #edbd55;border-radius:8px;padding:16px 25px;font-size:16px;font-weight:700;line-height:20px;text-decoration:none;color:#17212b;mso-padding-alt:16px 25px">${linkLabel(url)} &rarr;</a></td></tr></table></td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(heading)}</title><style>body{margin:0!important;padding:0!important}table{border-collapse:collapse}a[x-apple-data-detectors]{color:inherit!important} @media(max-width:600px){.outer{padding:18px 10px!important}.pad{padding:28px 22px!important}.headline{font-size:28px!important;line-height:35px!important}}</style></head>
<body style="background:#eef0f3;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;color:#eef0f3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(style.note)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef0f3"><tr><td class="outer" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e0e4e9;border-radius:18px;overflow:hidden">
<tr><td class="pad" bgcolor="#111d29" style="padding:34px 38px 36px;border-top:5px solid #edbd55">
<a href="${SITE}" style="font-size:25px;line-height:32px;font-weight:700;letter-spacing:-1px;text-decoration:none;color:#ffffff">Cinne<span style="color:#edbd55">Temple</span></a>
<div style="margin-top:35px;font-size:10px;font-weight:700;line-height:16px;letter-spacing:2px;color:#edbd55">${style.label}</div>
<h1 class="headline" style="margin:12px 0 0;font-size:34px;line-height:42px;letter-spacing:-1px;font-weight:700;color:#ffffff;overflow-wrap:anywhere">${escape(heading)}</h1>
</td></tr>
<tr><td class="pad" style="padding:32px 38px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${content}${actions}</table></td></tr>
<tr><td style="padding:0 38px"><div style="border-top:1px dashed #cdd4dc;font-size:1px;line-height:1px">&nbsp;</div></td></tr>
<tr><td class="pad" style="padding:24px 38px 30px"><div style="font-size:12px;line-height:20px;color:#697582">${hasCode ? 'Keep your code private. CinneTemple will never ask you to share it by email.' : 'Your stories. Your cinema. CinneTemple.'}</div></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td align="center" style="padding:24px 22px;font-size:12px;line-height:20px;color:#697582"><strong style="color:#485361">CinneTemple</strong><br>This email relates to your account or activity on CinneTemple.<br><a href="${SITE}" style="color:#596675;text-decoration:underline">cinnetemple.com</a></td></tr></table>
</td></tr></table></body></html>`;
}
