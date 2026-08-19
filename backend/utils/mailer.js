import nodemailer from 'nodemailer';

/**
 * ## Where a message actually goes
 *
 * Real people who register with a real address should get real email — a
 * password reset that lands in an inbox they can open.
 *
 * The demo accounts (`demo@jamii.app`, every seeded `<handle>@jamii.app`) and
 * anything typed into the register form while poking at a portfolio app are
 * addresses that don't exist. Pushing those through a live SMTP server
 * generates hard bounces, and enough hard bounces is how a sending domain
 * gets blocked — so they go to a Mailtrap sandbox inbox instead, which
 * accepts everything, delivers nothing onward, and lets you read exactly
 * what would have been sent.
 *
 * `pickRoute` decides per message. `MAIL_MODE` overrides it:
 *
 *   auto     (default) — deliverable addresses live, everything else sandbox
 *   sandbox            — everything to Mailtrap, nothing leaves
 *   live               — everything through the real SMTP server
 *
 * With neither server configured, messages are logged and reported as
 * undelivered. Nothing here ever throws into a request on its own — password
 * reset is the one caller that checks `delivered` and acts on it.
 */

const RESERVED = ['example.com', 'example.net', 'example.org', 'jamii.app'];
const RESERVED_TLDS = ['.test', '.example', '.invalid', '.localhost', '.local'];

const extraSandboxDomains = (process.env.MAIL_SANDBOX_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// Deliberately permissive: this decides which server to hand the address to,
// not whether the address is worth having. Rejecting valid-but-unusual
// addresses (plus tags, long TLDs, quoted locals) would lose real people, and
// the mail server is the thing that finally knows.
const SYNTAX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** `true` when a live mail server could plausibly deliver to this address. */
export const isDeliverableAddress = (address) => {
  const email = String(address || '').trim().toLowerCase();
  if (!SYNTAX.test(email)) return false;

  const domain = email.split('@')[1];
  if (RESERVED.includes(domain)) return false;
  if (RESERVED_TLDS.some((tld) => domain.endsWith(tld))) return false;
  if (extraSandboxDomains.includes(domain)) return false;

  return true;
};

const configured = (host, user) => Boolean(host && user);

const liveConfig = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USERNAME || process.env.SMTP_EMAIL,
  pass: process.env.SMTP_PASSWORD,
});

const sandboxConfig = () => ({
  // Mailtrap's sandbox endpoint is fixed, so only the credentials normally
  // need setting — one less thing to get wrong in a .env.
  host: process.env.MAILTRAP_HOST || 'sandbox.smtp.mailtrap.io',
  port: Number(process.env.MAILTRAP_PORT) || 2525,
  user: process.env.MAILTRAP_USER,
  pass: process.env.MAILTRAP_PASSWORD,
});

/**
 * Which server this address belongs to, and why.
 *
 * The `reason` is carried through to the send result and the logs, because
 * "the email never arrived" is otherwise indistinguishable from "the email
 * went to Mailtrap, as designed".
 */
export const pickRoute = (address) => {
  const mode = (process.env.MAIL_MODE || 'auto').toLowerCase();
  const live = liveConfig();
  const sandbox = sandboxConfig();

  const liveReady = configured(live.host, live.user);
  const sandboxReady = configured(sandbox.host, sandbox.user);

  const wantsSandbox =
    mode === 'sandbox' || (mode !== 'live' && !isDeliverableAddress(address));

  if (wantsSandbox) {
    if (sandboxReady) {
      return {
        name: 'sandbox',
        config: sandbox,
        reason:
          mode === 'sandbox'
            ? 'MAIL_MODE=sandbox — nothing leaves this machine'
            : 'address is not deliverable (demo or reserved domain)',
      };
    }
    return { name: 'log', reason: 'no Mailtrap credentials (MAILTRAP_USER/MAILTRAP_PASSWORD)' };
  }

  if (liveReady) {
    return { name: 'live', config: live, reason: 'deliverable address' };
  }
  // A real person's mail is worth keeping somewhere readable rather than
  // dropping because the production server isn't set up yet.
  if (sandboxReady) {
    return { name: 'sandbox', config: sandbox, reason: 'no live SMTP configured — held in sandbox' };
  }
  return { name: 'log', reason: 'no SMTP configured (SMTP_HOST/SMTP_USERNAME)' };
};

// One transport per server, not per message: nodemailer pools connections, and
// building a fresh transport for every email opens and tears down a TLS
// session each time.
const transports = new Map();

const transportFor = ({ name, config }) => {
  if (!transports.has(name)) {
    transports.set(
      name,
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        // 465 is implicit TLS; 587 and 2525 upgrade with STARTTLS.
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
        // Bounded, because the request awaiting this (password reset) has
        // nothing else to fall back on. Nodemailer's defaults run to two
        // minutes, which would hang the request behind an unreachable mail
        // host rather than falling through to the logged fallback.
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 15000,
      }),
    );
  }
  return transports.get(name);
};

const fromHeader = () => {
  const name = process.env.SMTP_FROM_NAME || 'JamiiChat';
  const address = process.env.SMTP_FROM_EMAIL || process.env.SMTP_EMAIL || 'no-reply@jamii.app';
  return `${name} <${address}>`;
};

/**
 * Send a rendered template.
 *
 * Resolves to a result rather than throwing by default — most callers here
 * would be in the middle of something more important than the email, if this
 * had any callers besides password reset. Reset has nothing else to offer
 * the user, so it reads `delivered` and acts on it.
 */
export const sendTemplate = async (to, template, options = {}) => {
  const address = String(to || '').trim();
  if (!address) return { delivered: false, route: 'none', reason: 'no recipient' };

  const route = pickRoute(address);

  if (route.name === 'log') {
    console.warn(
      `[mail] not sent to ${address} — ${route.reason}\n` +
        `       subject: ${template.subject}\n` +
        template.text.replace(/^/gm, '       '),
    );
    return { delivered: false, route: 'log', reason: route.reason, template };
  }

  try {
    await transportFor(route).sendMail({
      from: fromHeader(),
      to: address,
      subject: template.subject,
      text: template.text,
      html: template.html,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });

    if (route.name === 'sandbox') {
      console.info(`[mail] ${address} → Mailtrap sandbox (${route.reason}): ${template.subject}`);
    }
    return { delivered: true, route: route.name, reason: route.reason };
  } catch (error) {
    console.error(`[mail] send to ${address} failed via ${route.name}:`, error.message);
    return { delivered: false, route: route.name, reason: error.message, template };
  }
};

/** Whether any mail server is reachable at all — used to shape dev fallbacks. */
export const mailConfigured = () => pickRoute('probe@example-real-domain.com').name !== 'log';
