import crypto from 'crypto';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE = 30 * DAY;

function secret() {
  const s = process.env.SESSION_SECRET || process.env.IP_HASH_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (!s) throw new Error('SESSION_SECRET/IP_HASH_SECRET fehlt');
  return s;
}

export function cleanName(v) {
  return String(v || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 32) || 'Spieler';
}

export function avatarUrl(user) {
  if (!user?.avatar) return '';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

export function sign(data, maxAge = SESSION_MAX_AGE) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + maxAge })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySigned(ticket) {
  try {
    const [payload, sig] = String(ticket || '').split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest();
    const got = Buffer.from(sig, 'base64url');
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.id || !data.exp || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

export function parseCookies(raw = '') {
  const out = {};
  for (const part of String(raw).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { out[decodeURIComponent(part.slice(0, i).trim())] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}

export function sessionFromCookie(raw) {
  return verifySigned(parseCookies(raw).cc_session);
}

export function sessionCookie(user) {
  const value = sign({ id: String(user.id), name: cleanName(user.name), avatar: String(user.avatar || '').slice(0, 500) });
  return `cc_session=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}`;
}

export function clearSessionCookie() {
  return 'cc_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}
