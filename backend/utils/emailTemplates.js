/**
 * Every message the app sends, as `{ subject, text, html }`.
 *
 * Both parts are written, not generated from one another: the plain-text half
 * is what a screen reader, a watch notification and a spam filter all read
 * first, and an auto-stripped HTML body reads like debris in all three.
 */

const BRAND = process.env.SMTP_FROM_NAME || 'JamiiChat';

/** Anything interpolated into the HTML body goes through this first. */
const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * One layout for every message: a plain, single-column card.
 *
 * Inline styles and a table-free body on purpose — this has to survive Gmail
 * stripping the `<style>` block and Outlook rendering with Word. Colours
 * match the app's violet `primary`; nothing here depends on an image
 * loading, since most clients block them by default.
 */
const layout = ({ heading, body, action }) => `
<div style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6eb;border-radius:8px;overflow:hidden;">
    <div style="padding:20px 28px;border-bottom:1px solid #eef0f3;">
      <span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;color:#7c3aed;">${escape(BRAND)}</span>
    </div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;font-weight:600;color:#111827;">${escape(heading)}</h1>
      ${body}
      ${
        action
          ? `<p style="margin:24px 0 0;">
               <a href="${escape(action.url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:6px;">${escape(action.label)}</a>
             </p>
             <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#6b7280;word-break:break-all;">
               Or paste this into your browser:<br>${escape(action.url)}
             </p>`
          : ''
      }
    </div>
    <div style="padding:16px 28px;border-top:1px solid #eef0f3;background:#fafbfc;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
        You're receiving this because you have a ${escape(BRAND)} account.
      </p>
    </div>
  </div>
</div>`;

const paragraph = (text) =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#374151;">${text}</p>`;

/** Sent by `forgotPassword`. The 30 minutes matches `getResetPasswordToken`. */
export const passwordReset = ({ user, resetUrl }) => ({
  subject: `Reset your ${BRAND} password`,
  text: [
    `Hi @${user.handle},`,
    '',
    `Someone asked to reset the password on your ${BRAND} account. Open the link below to choose a new one:`,
    '',
    resetUrl,
    '',
    "The link is good for 30 minutes. If this wasn't you, ignore this email — nothing has changed.",
  ].join('\n'),
  html: layout({
    heading: 'Choose a new password',
    body:
      paragraph(`Hi @${escape(user.handle)},`) +
      paragraph(
        `Someone asked to reset the password on your ${escape(BRAND)} account. The link below is good for <strong>30 minutes</strong>.`,
      ) +
      paragraph(
        `<span style="color:#6b7280;font-size:13px;">If this wasn't you, ignore this email — nothing has changed.</span>`,
      ),
    action: { label: 'Reset my password', url: resetUrl },
  }),
});
