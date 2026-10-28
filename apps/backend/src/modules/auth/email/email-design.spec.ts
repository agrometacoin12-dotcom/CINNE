import { renderEmail } from './email-design';

describe('transactional email design', () => {
  it('escapes catalogue content and never links untrusted domains', () => {
    const html = renderEmail('<img src=x onerror=alert(1)>', '<script>alert(1)</script>\nhttps://cinnetemple.com.evil.test/steal\nhttps://www.cinnetemple.com@evil.test');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="https://cinnetemple.com.evil.test');
    expect(html).not.toContain('href="https://www.cinnetemple.com@evil.test');
  });
  it('preserves private producer link fragments', () => {
    const html = renderEmail('Your CinneTemple producer dashboard', 'https://www.cinnetemple.com/producer#key=secret-test');
    expect(html).toContain('href="https://www.cinnetemple.com/producer#key=secret-test"');
    expect(html).toContain('Open producer dashboard');
    expect(html).toContain('Your private dashboard link');
  });
  it('renders codes separately without leaking them in the hidden preview', () => {
    const html = renderEmail('Reset your CinneTemple password', 'Your code:\n\n123456\n\nDo not share it.');
    expect(html).toContain('letter-spacing:6px');
    expect(html).toContain('123456');
    expect(html.split('</div>')[0]).not.toContain('123456');
  });
  it('keeps negative amounts and references intact', () => {
    const html = renderEmail('Apple purchase refund applied — CinneTemple', 'Wallet change: -500 coins\nBalance after this transaction: -100 coins\nReference: refund-123\nOpen the app for details.');
    for (const value of ['-500 coins', '-100 coins', 'refund-123', 'Open the app for details.']) expect(html).toContain(value);
    expect(html).not.toContain('Payment successful');
  });
  it('supports all alert families with responsive table layouts', () => {
    for (const subject of ['Welcome to CinneTemple', 'Movie upload attached', 'Episode upload updated', 'Movie ticket confirmed', 'Coin top-up unsuccessful', 'Withdrawal declined', 'Producer dashboard email needs attention']) {
      const html = renderEmail(subject, 'Status: PENDING\nReference: test-only');
      expect(html).toContain('role="presentation"');
      expect(html).toContain('@media(max-width:600px)');
      expect(html).toContain('PENDING');
      expect(html).not.toContain('undefined');
    }
  });
});
