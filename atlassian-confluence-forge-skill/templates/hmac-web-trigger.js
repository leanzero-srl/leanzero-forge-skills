// HMAC-Signed Web Trigger Template
//
// A public Forge web trigger that performs a privileged action from an email
// link, authorised by an HMAC-signed, expiring capability token (no Atlassian
// login required). Mint the link with mintToken(); verify it constant-time.
//
// SECURITY (see docs/18-unlicensed-access-and-web-triggers.md):
//   - 256-bit secret: crypto.randomBytes(32).toString('hex'), stored in app config.
//     Rotating it invalidates every outstanding link.
//   - Parse accountId from the RIGHT — legacy ids (557058:uuid) contain colons.
//   - crypto.timingSafeEqual on equal-length buffers — never === on the signature.
//   - Return a GENERIC failure page for every error class (no timing/info oracle).
//   - Get the web-trigger URL at runtime via webTrigger.getUrl(key) — never hardcode.
//   - A valid token proves AUTHENTICITY, not AUTHORIZATION: re-check eligibility
//     before acting (org status may have changed since the email was sent).
//
// Manifest:
//   modules:
//     webtrigger:
//       - key: {{APP_KEY}}-action-webtrigger
//         function: handleAction
//     function:
//       - key: handleAction
//         handler: index.handleAction

import crypto from 'crypto';
import { webTrigger } from '@forge/api';
import { kvs } from '@forge/kvs';

const EXPIRY_HOURS = 168; // 7 days

async function getSecret() {
  // Generate once and persist; reuse thereafter. Store in your config table or
  // a KVS secret. Rotating this value revokes all outstanding links.
  let secret = await kvs.getSecret('hmac-secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex'); // 256-bit
    await kvs.setSecret('hmac-secret', secret);
  }
  return secret;
}

export async function mintToken(accountId, expiryHours = EXPIRY_HOURS) {
  const secret = await getSecret();
  const expiry = Date.now() + expiryHours * 3600 * 1000;
  const payload = `${accountId}:${expiry}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url'); // url-safe wrapper
}

export function verifyToken(token, secret) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length < 3) return { valid: false, reason: 'Malformed token' };

    const sig = parts[parts.length - 1];
    const expiryStr = parts[parts.length - 2];
    const accountId = parts.slice(0, parts.length - 2).join(':'); // rejoin colons
    const expiry = parseInt(expiryStr, 10);

    if (!accountId) return { valid: false, reason: 'Malformed token' };
    if (Number.isNaN(expiry)) return { valid: false, reason: 'Invalid expiry' };
    if (Date.now() > expiry) return { valid: false, reason: 'Token expired' };

    const expected = crypto.createHmac('sha256', secret)
      .update(`${accountId}:${expiryStr}`).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, reason: 'Invalid signature' };
    }
    return { valid: true, accountId };
  } catch {
    return { valid: false, reason: 'Token decode failed' };
  }
}

// Build a link to email the user. URL is environment-specific → resolve at runtime.
export async function buildActionLink(accountId) {
  const baseUrl = await webTrigger.getUrl('{{APP_KEY}}-action-webtrigger');
  const token = await mintToken(accountId);
  return `${baseUrl}?token=${token}`;
}

// Web-trigger handler. queryParameters values are string[] arrays.
export async function handleAction(request) {
  const token = request.queryParameters?.token?.[0];
  if (!token) return html(400, 'Invalid Link', 'This link is invalid or has expired.');

  const secret = await getSecret();
  const v = verifyToken(token, secret);
  if (!v.valid || !v.accountId) {
    // Generic message for every failure class — no oracle.
    return html(403, 'Invalid Link', 'This link is invalid or has expired.');
  }

  // Authenticity != authorization. Re-check the action is still allowed.
  const eligible = await reEvaluateEligibility(v.accountId);
  if (!eligible) return html(403, 'Not Available', 'This action is no longer available for your account.');

  await performPrivilegedAction(v.accountId);
  return html(200, 'Done', 'Your request has been processed.');
}

function html(statusCode, title, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head>
<body><h1>${title}</h1><p>${message}</p></body></html>`,
  };
}

// Implement these for your app:
async function reEvaluateEligibility(_accountId) { return true; }
async function performPrivilegedAction(_accountId) { /* ... */ }
