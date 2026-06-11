#!/bin/bash
# ============================================================================
# SECOND BRAIN - SECURITY VALIDATION CHECKLIST (Next.js layout)
# Usage: npm run security-check   (or: bash security-checklist.sh)
# ============================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0; fail_count=0

test_pass()    { echo -e "${GREEN}✓ PASS${NC}: $1"; pass_count=$((pass_count+1)); }
test_fail()    { echo -e "${RED}✗ FAIL${NC}: $1"; fail_count=$((fail_count+1)); }
test_warning() { echo -e "${YELLOW}⚠ WARN${NC}: $1"; }

cd "$(dirname "$0")"
ENV_FILE=".env.local"

echo "🔒 SECOND BRAIN - SECURITY VALIDATION"
echo "====================================="

# ---------------------------------------------------------------- [1] env
echo -e "\n${YELLOW}[1/6] ENVIRONMENT${NC}"

[ -f "$ENV_FILE" ] && test_pass "$ENV_FILE exists" || test_fail "$ENV_FILE not found"

if grep -qE "^\.env" .gitignore 2>/dev/null; then
  test_pass ".env* is in .gitignore"
else
  test_fail ".env* NOT in .gitignore (SECRET LEAK RISK)"
fi

get_var() { grep "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d ' '; }

JWT_SECRET=$(get_var JWT_SECRET)
REFRESH_SECRET=$(get_var REFRESH_TOKEN_SECRET)
[ ${#JWT_SECRET} -ge 64 ] && test_pass "JWT_SECRET is 256-bit+ (${#JWT_SECRET} chars)" || test_fail "JWT_SECRET too short (${#JWT_SECRET} chars)"
[ ${#REFRESH_SECRET} -ge 64 ] && test_pass "REFRESH_TOKEN_SECRET is 256-bit+" || test_fail "REFRESH_TOKEN_SECRET too short"
[ -n "$JWT_SECRET" ] && [ "$JWT_SECRET" != "$REFRESH_SECRET" ] && test_pass "JWT and refresh secrets differ" || test_fail "JWT and refresh secrets identical or empty"

ALLOWED_EMAIL=$(get_var ALLOWED_EMAIL)
if echo "$ALLOWED_EMAIL" | grep -qE "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"; then
  test_pass "ALLOWED_EMAIL valid: $ALLOWED_EMAIL"
else
  test_fail "ALLOWED_EMAIL invalid or missing"
fi

# ---------------------------------------------------------------- [2] keys
echo -e "\n${YELLOW}[2/6] API KEYS${NC}"

GROQ_KEY=$(get_var GROQ_API_KEY)
case "$GROQ_KEY" in
  gsk_YOUR*|""|gsk_xxx*) test_fail "GROQ_API_KEY is a placeholder - paste the real key from console.groq.com" ;;
  gsk_*) test_pass "GROQ_API_KEY is set (gsk_…)" ;;
  *) test_fail "GROQ_API_KEY has unexpected format" ;;
esac

GH_TOKEN=$(get_var GITHUB_TOKEN)
case "$GH_TOKEN" in
  ghp_YOUR*|github_pat_YOUR*|"") test_fail "GITHUB_TOKEN is a placeholder - paste your fine-grained token" ;;
  ghp_*|github_pat_*) test_pass "GITHUB_TOKEN is set" ;;
  *) test_fail "GITHUB_TOKEN has unexpected format" ;;
esac

GH_OWNER=$(get_var GITHUB_OWNER)
GH_REPO=$(get_var GITHUB_REPO)
[ -n "$GH_OWNER" ] && [ "$GH_OWNER" != "your-github-username" ] && test_pass "GITHUB_OWNER set: $GH_OWNER" || test_fail "GITHUB_OWNER not set"
[ -n "$GH_REPO" ] && test_pass "GITHUB_REPO set: $GH_REPO" || test_fail "GITHUB_REPO not set"

# ---------------------------------------------------------------- [3] code
echo -e "\n${YELLOW}[3/6] CODE SECURITY${NC}"

SRC_DIRS="lib pages"
HARDCODED=$(grep -rE "gsk_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}" $SRC_DIRS 2>/dev/null | wc -l | tr -d ' ')
[ "$HARDCODED" = "0" ] && test_pass "No hardcoded API keys in source" || test_fail "Found $HARDCODED hardcoded key(s) in source!"

EVAL_COUNT=$(grep -rE "\beval\(|new Function\(" $SRC_DIRS 2>/dev/null | wc -l | tr -d ' ')
[ "$EVAL_COUNT" = "0" ] && test_pass "No eval() / new Function()" || test_fail "Found $EVAL_COUNT eval-like call(s)"

SECRET_LOGS=$(grep -rE "console\.(log|error|warn)\(.*(JWT_SECRET|GROQ_API_KEY|GITHUB_TOKEN|REFRESH_TOKEN_SECRET|accessToken)" $SRC_DIRS 2>/dev/null | wc -l | tr -d ' ')
[ "$SECRET_LOGS" = "0" ] && test_pass "No secret values logged" || test_fail "Found $SECRET_LOGS potential secret log(s)"

if grep -q "Alexandre.gf.pierre@gmail.com" lib/*.js pages/api/**/*.js 2>/dev/null; then
  test_fail "Email hardcoded in server code (should come from env only)"
else
  test_pass "No hardcoded email fallback in server code"
fi

# ---------------------------------------------------------------- [4] perms
echo -e "\n${YELLOW}[4/6] FILE PERMISSIONS${NC}"

if [ -f "$ENV_FILE" ]; then
  ENV_PERMS=$(stat -f %OLp "$ENV_FILE" 2>/dev/null || stat -c %a "$ENV_FILE" 2>/dev/null)
  [ "$ENV_PERMS" = "600" ] && test_pass "$ENV_FILE permissions are 600" || test_warning "$ENV_FILE permissions are $ENV_PERMS (run: chmod 600 $ENV_FILE)"
fi

# ---------------------------------------------------------------- [5] deps
echo -e "\n${YELLOW}[5/6] DEPENDENCIES${NC}"

for package in next groq-sdk "@octokit/rest" jsonwebtoken; do
  grep -q "\"$package\"" package.json && test_pass "Dependency present: $package" || test_fail "Missing dependency: $package"
done

if [ -d node_modules ]; then
  CRIT=$(npm audit --omit=dev --audit-level=high 2>/dev/null | grep -cE "high|critical")
  [ "$CRIT" = "0" ] && test_pass "npm audit: no high/critical vulnerabilities" || test_warning "npm audit reports issues - run: npm audit"
else
  test_warning "node_modules missing - run npm install first"
fi

# ---------------------------------------------------------------- [6] git
echo -e "\n${YELLOW}[6/6] GIT & DEPLOYMENT READINESS${NC}"

[ -d .git ] && test_pass "Git repository initialized" || test_fail "Not a git repo - run: git init"

if git ls-files 2>/dev/null | grep -q "\.env"; then
  test_fail ".env file is tracked by git - run: git rm --cached <file>"
else
  test_pass "No .env files tracked by git"
fi

# ---------------------------------------------------------------- summary
echo ""
echo "====================================="
echo -e "${GREEN}✓ Passed: $pass_count${NC}  ${RED}✗ Failed: $fail_count${NC}"
if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}🎯 ALL SECURITY CHECKS PASSED${NC}"
  exit 0
else
  echo -e "${RED}❌ FIX FAILURES BEFORE DEPLOYING${NC}"
  exit 1
fi
