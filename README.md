# Second Brain

Free personal AI knowledge vault: chat with your Obsidian-style markdown notes via Llama 3.3 70B (Groq), with a private GitHub repo as the database. Single user, $0/month (Vercel free + GitHub free + Groq free tier).

## Stack

- **Next.js 14** (pages router) — UI + API routes, deployed on Vercel free tier
- **Groq** — Llama 3.3 70B with tool calling (free tier, 1,000 req/day)
- **GitHub REST API** (Octokit) — private `second-brain-vault` repo stores all notes
- **JWT** — 24h access token + 30d refresh token (httpOnly cookie)

## Project layout

```
lib/security.js        withSecurity middleware: CORS, rate limit, injection screen, JWT
lib/system-prompt.js   hardened LLM system prompt
lib/github.js          vault tools: read/write/search/list + path validation
pages/api/auth/login.js    POST /api/auth/login
pages/api/auth/refresh.js  POST /api/auth/refresh
pages/api/brain.js         POST /api/brain (agentic Groq loop)
pages/index.js         Login + Chat UI
security-checklist.sh  pre-deploy validation (npm run security-check)
```

## Local setup

1. `npm install`
2. Open `.env.local` and replace the two placeholders:
   - `GROQ_API_KEY` — from https://console.groq.com/keys
   - `GITHUB_TOKEN` / `GITHUB_OWNER` — your fine-grained PAT (Contents R+W on the vault repo only) and GitHub username
3. `npm run security-check` — must pass
4. `npm run dev` → http://localhost:3000

JWT secrets were generated locally and are already in `.env.local` (chmod 600, gitignored).

### Optional hardening (recommended before going public)

Email-only login means anyone who knows your email can log in. Uncomment `ACCESS_KEY` in `.env.local` to also require a passphrase; the login form sends it as `accessKey`. (UI field appears automatically server-side rejection otherwise.)

## Deploy to Vercel (Phase 3)

1. Push this repo to a **private** GitHub repo (e.g. `second-brain-app`). `.env.local` is gitignored — verify with `git status` before pushing.
2. Vercel → New Project → import the repo.
3. Add environment variables (Settings → Environment Variables, mark sensitive):
   `ALLOWED_EMAIL, JWT_SECRET, REFRESH_TOKEN_SECRET, JWT_EXPIRY, GROQ_API_KEY, GROQ_MODEL, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, CORS_ORIGIN=https://brain.daemon-tech.fr, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS` (+ `ACCESS_KEY` if used)
4. Deploy, then add the domain: Project → Domains → `brain.daemon-tech.fr`, and at your DNS registrar add `CNAME brain → cname.vercel-dns.com`.
5. Post-deploy checks: HTTPS lock, wrong email → 403, no token → 401, security headers present (`curl -I`).

## Known limitations (accepted for $0 budget)

- **Rate limiting is per serverless instance** (in-memory). A determined attacker can exceed 50 req/h across cold starts. Durable limiting needs Upstash Redis (has a free tier) if ever required.
- **GitHub code search** may lag on freshly-pushed private repos; search falls back to filename matching over the full git tree.
- **Notes are capped at 1MB** (GitHub contents API inline limit) — irrelevant for markdown.
