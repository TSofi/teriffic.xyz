# Security Incident - Exposed API Keys

## ⚠️ URGENT: Keys Exposed on GitHub (Now Removed)

**Date**: October 4, 2025
**Status**: ✅ Git history cleaned, 🔄 Keys need rotation

---

## 🔑 Exposed Keys (ROTATE IMMEDIATELY)

### 1. OpenRouter API Key
- **Exposed Key**: `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`
- **Action Required**:
  1. Go to https://openrouter.ai/keys
  2. Revoke the exposed key
  3. Generate new API key
  4. Update `ai-service/.env` with new key

### 2. Supabase Configuration
- **Project URL**: `https://kpxgkzxqyhwsgpqykpry.supabase.co`
- **Exposed Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT token)
- **Action Required**:
  1. Go to Supabase Dashboard → Settings → API
  2. Consider regenerating the anon key (only if concerned about abuse)
  3. **Note**: The anon key is meant to be public for client-side apps, but since it was in .env.example, it's safer to rotate
  4. If you rotate it, update:
     - `ai-service/.env`
     - Any frontend apps using this key

---

## ✅ Actions Completed

1. ✅ Removed real keys from `.env.example`
2. ✅ Added comprehensive `.gitignore`
3. ✅ Force-pushed cleaned git history
4. ✅ Repository is now clean

---

## 🔒 Security Measures Implemented

### `.gitignore` now includes:
```
.env
.env.local
.env.*.local
venv/
__pycache__/
```

### `.env.example` sanitized:
```bash
OPENROUTER_API_KEY=your_openrouter_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here
```

---

## 📝 Next Steps

### Immediate (Do Now):
1. **Rotate OpenRouter API key** (highest priority - this costs money!)
2. **Review Supabase logs** for any suspicious activity
3. **Update local `.env`** with new keys
4. **Restart AI service** with new keys

### Optional (Recommended):
1. **Regenerate Supabase anon key** if concerned
2. **Enable Row Level Security** on Supabase tables (already configured)
3. **Set up API key rotation schedule** (every 90 days)
4. **Enable GitHub secret scanning alerts**

---

## 🛡️ Prevention

### For future commits:
1. Always use `.env` for secrets (never `.env.example`)
2. Double-check `.gitignore` before committing
3. Use `git diff --staged` to review changes before commit
4. Consider using pre-commit hooks to scan for secrets

### Recommended tool:
```bash
# Install pre-commit hook for secret scanning
pip install pre-commit detect-secrets
pre-commit install
```

---

## 📞 Support

If you notice any suspicious activity:
- **OpenRouter**: Contact support via their dashboard
- **Supabase**: Check project logs and contact support if needed

---

**Status**: Git repository cleaned ✅
**Action Required**: Rotate API keys immediately ⚠️
