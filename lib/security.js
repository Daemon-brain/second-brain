/**
 * SECURITY LAYER for Next.js API routes.
 *
 * Note: this intentionally does NOT use helmet/cors/express-rate-limit.
 * Those are Express middleware and do not plug into Next.js API routes;
 * the equivalent protections are implemented natively below.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration (fail closed: no hardcoded email fallback)
// ---------------------------------------------------------------------------
const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL || '').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '50', 10);

const ALLOWED_ORIGINS = [
  process.env.CORS_ORIGIN || 'https://brain.daemon-tech.fr',
  'http://localhost:3000',
  'http://localhost:3001',
];

function assertConfig() {
  const missing = [];
  if (!ALLOWED_EMAIL) missing.push('ALLOWED_EMAIL');
  if (!JWT_SECRET || JWT_SECRET.length < 64) missing.push('JWT_SECRET (need 64+ hex chars)');
  if (!REFRESH_TOKEN_SECRET || REFRESH_TOKEN_SECRET.length < 64) {
    missing.push('REFRESH_TOKEN_SECRET (need 64+ hex chars)');
  }
  if (missing.length) {
    throw new Error(`Server misconfigured, missing env: ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Logging - structured JSON to stdout (captured by Vercel).
// Vercel's filesystem is read-only, so file-based logs are not an option.
// Never log secrets, tokens, queries, or file contents.
// ---------------------------------------------------------------------------
function logSecurityEvent(event, user = 'unknown', details = '') {
  const entry = {
    ts: new Date().toISOString(),
    event,
    user,
    details: String(details).slice(0, 120),
  };
  console.log(JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory sliding window, per IP).
// Limitation: on Vercel each serverless instance has its own store, so the
// effective limit is per-instance. Acceptable for a single-user app at $0;
// a durable store (Upstash Redis free tier) would be needed for hard limits.
// ---------------------------------------------------------------------------
const rateLimitStore = new Map();

function getClientIp(req) {
  // Vercel sets x-forwarded-for; first entry is the client
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip, max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS, bucket = 'api') {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  let hits = rateLimitStore.get(key) || [];
  hits = hits.filter((t) => t > now - windowMs);
  if (hits.length >= max) {
    rateLimitStore.set(key, hits);
    return false;
  }
  hits.push(now);
  rateLimitStore.set(key, hits);
  // Opportunistic cleanup so the map can't grow unbounded
  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore) {
      if (!v.length || v[v.length - 1] < now - windowMs) rateLimitStore.delete(k);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Injection detection.
// Patterns are deliberately NARROW: they target explicit override phrasing
// and path traversal. Broad patterns like /ignore/ or /security/ would block
// legitimate queries ("show me my notes about security"). The hardened
// system prompt + server-side tool validation are the real defenses; this
// layer just rejects the obvious, unambiguous attacks early.
// ---------------------------------------------------------------------------
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+)?(your\s+|the\s+|previous\s+|prior\s+|above\s+)*instructions/i,
  /disregard\s+(all\s+|any\s+)?(your\s+|the\s+|previous\s+|prior\s+)*(instructions|rules)/i,
  /forget\s+(all\s+|your\s+)?(previous\s+)?(instructions|rules)/i,
  /(reveal|show|print|display)\s+(me\s+)?(your\s+|the\s+)?system\s*prompt/i,
  /you\s+are\s+now\s+(in\s+)?(developer|dan|jailbreak|god)\s*mode/i,
  /\.\.\//, // path traversal
  /\.\.\\/,
  /\.\.%2[fF]/,
  /\.\.%5[cC]/,
];

function detectInjection(value) {
  if (typeof value === 'string') {
    return INJECTION_PATTERNS.some((p) => p.test(value));
  }
  if (Array.isArray(value)) return value.some(detectInjection);
  if (value && typeof value === 'object') {
    return Object.values(value).some(detectInjection);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Cache-Control', 'no-store');
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function applyCors(req, res) {
  const origin = req.headers.origin;
  // Same-origin / non-browser requests (curl) have no Origin header: allow.
  // Real protection is the JWT requirement, not CORS.
  if (!origin) return true;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    logSecurityEvent('CORS_REJECTED', 'unknown', origin);
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------
function generateTokens(email) {
  const accessToken = jwt.sign({ email, type: 'access' }, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
  const refreshToken = jwt.sign({ email, type: 'refresh' }, REFRESH_TOKEN_SECRET, {
    expiresIn: '30d',
  });
  return { accessToken, refreshToken };
}

function verifyAccessToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    if (decoded.type !== 'access') return null; // refresh tokens are not access tokens
    return decoded;
  } catch {
    return null;
  }
}

function verifyRefreshToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
    if (decoded.type !== 'refresh') return null;
    return decoded;
  } catch {
    return null;
  }
}

// Constant-time string comparison (avoids timing side-channels on the email check)
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isAllowedEmail(email) {
  return typeof email === 'string' && safeEqual(email.toLowerCase(), ALLOWED_EMAIL);
}

// ---------------------------------------------------------------------------
// withSecurity HOF
// options: { requireAuth: bool, rateLimit: { max, windowMs, bucket } }
// ---------------------------------------------------------------------------
function withSecurity(handler, options = {}) {
  const { requireAuth = true, rateLimit = {} } = options;

  return async (req, res) => {
    try {
      assertConfig();

      // 1. CORS
      if (!applyCors(req, res)) {
        return res.status(403).json({ error: 'CORS not allowed' });
      }
      if (req.method === 'OPTIONS') return res.status(204).end();

      // 2. Security headers
      setSecurityHeaders(res);

      // 3. Rate limiting
      const ip = getClientIp(req);
      const ok = checkRateLimit(
        ip,
        rateLimit.max ?? RATE_LIMIT_MAX,
        rateLimit.windowMs ?? RATE_LIMIT_WINDOW_MS,
        rateLimit.bucket ?? 'api'
      );
      if (!ok) {
        logSecurityEvent('RATE_LIMIT_EXCEEDED', 'unknown', ip);
        return res.status(429).json({ error: 'Too many requests' });
      }

      // 4. Injection / traversal screen on the raw body
      if (detectInjection(req.body)) {
        logSecurityEvent('INJECTION_ATTEMPT', req.user?.email || 'unknown', ip);
        return res.status(400).json({ error: 'Invalid request format' });
      }

      // 5. Authentication
      if (requireAuth) {
        const decoded = verifyAccessToken(req.headers.authorization);
        if (!decoded) {
          logSecurityEvent('MISSING_OR_INVALID_TOKEN', 'unknown', req.url);
          return res.status(401).json({ error: 'Missing or invalid authorization token' });
        }
        if (!isAllowedEmail(decoded.email)) {
          logSecurityEvent('UNAUTHORIZED_EMAIL', decoded.email, req.url);
          return res.status(403).json({ error: 'Access denied' });
        }
        req.user = decoded;
      }

      // 6. Handler
      return await handler(req, res);
    } catch (error) {
      // Generic error to the client, real error to server logs only
      console.error('[ERROR]', {
        ts: new Date().toISOString(),
        path: req.url,
        message: error.message,
      });
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}

module.exports = {
  withSecurity,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  isAllowedEmail,
  detectInjection,
  checkRateLimit,
  getClientIp,
  logSecurityEvent,
  ALLOWED_EMAIL,
};
