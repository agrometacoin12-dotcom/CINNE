/**
 * Cognito CustomMessage trigger — replaces the default plain OTP emails with a
 * branded CinneTemple HTML template for sign-up verification, code resends, and
 * password resets. The `{####}` / `{username}` placeholders are substituted by
 * Cognito after this function returns.
 */

interface CustomMessageEvent {
  triggerSource: string;
  request: {
    codeParameter: string;
    usernameParameter?: string;
    userAttributes?: Record<string, string>;
  };
  response: {
    smsMessage?: string;
    emailMessage?: string;
    emailSubject?: string;
  };
}

const BRAND = '#E50914';
const CODE = '{####}';

interface Copy {
  subject: string;
  heading: string;
  intro: string;
  includeUsername?: boolean;
}

function copyFor(source: string): Copy {
  switch (source) {
    case 'CustomMessage_SignUp':
    case 'CustomMessage_ResendCode':
      return {
        subject: 'Confirm your email · CinneTemple',
        heading: 'Confirm your email',
        intro: 'Welcome to CinneTemple. Enter this code to verify your email and step into the cinema.',
      };
    case 'CustomMessage_ForgotPassword':
      return {
        subject: 'Reset your password · CinneTemple',
        heading: 'Reset your password',
        intro: 'We received a request to reset your CinneTemple password. Use the code below to continue. If this wasn’t you, you can safely ignore this email.',
      };
    case 'CustomMessage_VerifyUserAttribute':
      return {
        subject: 'Verify your email · CinneTemple',
        heading: 'Verify your email',
        intro: 'Enter this code to confirm your email address on CinneTemple.',
      };
    case 'CustomMessage_Authentication':
      return {
        subject: 'Your sign-in code · CinneTemple',
        heading: 'Your sign-in code',
        intro: 'Use this one-time code to finish signing in to CinneTemple.',
      };
    case 'CustomMessage_AdminCreateUser':
      return {
        subject: 'Your CinneTemple account is ready',
        heading: 'Welcome to CinneTemple',
        intro: 'An account has been created for you. Sign in with your username and the temporary code below.',
        includeUsername: true,
      };
    default:
      return {
        subject: 'Your CinneTemple code',
        heading: 'Your verification code',
        intro: 'Use this one-time code to continue on CinneTemple.',
      };
  }
}

function renderEmail(copy: Copy): string {
  const usernameBlock = copy.includeUsername
    ? `<tr><td style="padding:0 40px 8px;font:14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#52525b;">Username: <strong style="color:#0b0b0f;">{username}</strong></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${copy.heading}</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.45);">
          <!-- Brand bar -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1030,#3a1020 70%,#0b0b0d);padding:28px 40px;">
              <span style="font:700 24px Georgia,'Times New Roman',serif;letter-spacing:-0.01em;color:#ffffff;">Cinne</span><span style="font:700 24px Georgia,'Times New Roman',serif;letter-spacing:-0.01em;color:${BRAND};">Temple</span>
            </td>
          </tr>
          <!-- Body -->
          <tr><td style="padding:36px 40px 8px;font:600 22px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b0b0f;">${copy.heading}</td></tr>
          <tr><td style="padding:0 40px 24px;font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#52525b;">${copy.intro}</td></tr>
          ${usernameBlock}
          <!-- Code -->
          <tr>
            <td style="padding:0 40px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center" style="background:#f4f4f6;border:1px solid #ececf0;border-radius:14px;padding:22px 0;">
                  <span style="font:700 34px 'SF Mono',Menlo,Consolas,monospace;letter-spacing:10px;color:#0b0b0f;padding-left:10px;">${CODE}</span>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:14px 40px 0;font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8a8a93;">This code expires shortly. For your security, never share it with anyone — CinneTemple will never ask you for it.</td></tr>
          <!-- Footer -->
          <tr><td style="padding:28px 40px 32px;border-top:1px solid #f0f0f3;margin-top:20px;">
            <p style="margin:18px 0 0;font:12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#a1a1aa;">You’re receiving this because someone used this address to access CinneTemple. If that wasn’t you, no action is needed.</p>
            <p style="margin:8px 0 0;font:12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#c4c4cc;">© CinneTemple · Your cinema, reimagined</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const handler = async (event: CustomMessageEvent): Promise<CustomMessageEvent> => {
  const copy = copyFor(event.triggerSource);
  event.response.emailSubject = copy.subject;
  event.response.emailMessage = renderEmail(copy);
  return event;
};
