/**
 * POST /api/auth/login
 * Email-locked authentication. Issues a 24h access token (returned in the
 * body) and a 30d refresh token (httpOnly cookie).
 *
 * SECURITY NOTE: email-only auth means the email IS the credential. Since
 * an email address is not a secret, set ACCESS_KEY in the environment to
 * additionally require a passphrase. If ACCESS_KEY is unset, behavior is
 * exactly the email-only flow from the PRD.
 */

const crypto = require('crypto');
const { withSecurity, generateTokens, isAllowedEmail, logSecurityEvent } = require('../../../lib/security');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, accessKey } = req.body || {};

  if (typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!isAllowedEmail(email)) {
    logSecurityEvent('LOGIN_FAILED', email.slice(0, 60), 'wrong email');
    return res.status(403).json({ error: 'Invalid credentials' });
  }

  if (!process.env.ACCESS_KEY || !safeEqual(accessKey || '', process.env.ACCESS_KEY)) {
    logSecurityEvent('LOGIN_FAILED', email.slice(0, 60), 'wrong access key');
    return res.status(403).json({ error: 'Invalid credentials' });
  }

  const { accessToken, refreshToken } = generateTokens(email.toLowerCase());

  // Secure flag breaks plain-http localhost, so only set it in production
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader(
    'Set-Cookie',
    `refreshToken=${refreshToken}; Path=/api/auth;${secure} HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`
  );

  logSecurityEvent('LOGIN_SUCCESS', email.toLowerCase());
  return res.status(200).json({ accessToken, expiresIn: '24h' });
}

// Login is unauthenticated by definition; give it a stricter rate limit
// than the global one to slow brute-force attempts.
export default withSecurity(handler, {
  requireAuth: false,
  rateLimit: { max: 10, windowMs: 15 * 60 * 1000, bucket: 'login' },
});
