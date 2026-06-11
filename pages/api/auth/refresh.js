/**
 * POST /api/auth/refresh
 * Exchanges the httpOnly refresh cookie for a new 24h access token, so the
 * UI can renew sessions without re-entering the email for 30 days.
 */

const {
  withSecurity,
  generateTokens,
  verifyRefreshToken,
  isAllowedEmail,
  logSecurityEvent,
} = require('../../../lib/security');

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2)
  );
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { refreshToken } = parseCookies(req.headers.cookie);
  const decoded = verifyRefreshToken(refreshToken);

  if (!decoded || !isAllowedEmail(decoded.email)) {
    logSecurityEvent('REFRESH_FAILED', decoded?.email || 'unknown');
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { accessToken } = generateTokens(decoded.email);
  logSecurityEvent('REFRESH_SUCCESS', decoded.email);
  return res.status(200).json({ accessToken, expiresIn: '24h' });
}

export default withSecurity(handler, {
  requireAuth: false,
  rateLimit: { max: 20, windowMs: 15 * 60 * 1000, bucket: 'refresh' },
});
