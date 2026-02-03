# Email Flow Analysis & Ubuntu VPS Fix Guide

## Current Email Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  EMAIL TRIGGERS                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  • Forgot password OTP     → sendForgotPasswordOTP()                 │
│  • 2FA OTP                 → sendTwoFactorOtp()                      │
│  • Partnership welcome     → sendPartnershipWelcomeEmail()           │
│  • Admin login alert       → sendAdminLoginNotification()            │
│  • New suggestion          → sendNewSuggestionEmail()                │
│  • Improvement feedback    → sendImprovementEmail()                  │
│  • PDF to email            → sendPdfToEmail()                        │
│  • Invoice email           → sendInvoiceEmail()                      │
│  • Direct message          → sendEmail()                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  getMailTransporter()                                                │
│  • service: "gmail"                                                  │
│  • port: 587                                                         │
│  • auth: NODE_MAILER_USER, NODE_MAILER_PASSWORD                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  smtp.gmail.com:587 (STARTTLS)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Why Email Fails on Ubuntu VPS

### 1. **Firewall blocking outbound port 587**
Many cloud providers (AWS, DigitalOcean, etc.) block outbound SMTP by default to prevent spam.

**Fix:** Open port 587 outbound or use port 465 (SSL) instead.

### 2. **Gmail blocks "suspicious" login from new IP**
When your app runs on a new VPS IP (often datacenter range), Gmail may block the login.

**Fix:**
- Use a Gmail **App Password** (not regular password) – you appear to have this
- Check https://myaccount.google.com/security for blocked sign-in attempts
- Temporarily allow "Less secure app access" if using older Gmail (deprecated for personal accounts)
- For Google Workspace (info@feetf1rst.com), ensure admin allows SMTP for your domain

### 3. **Environment variables not loaded**
`.env` path or loading may differ when running under PM2/systemd on VPS.

**Fix:** Ensure `.env` is in project root and loaded before the app starts. With PM2: `pm2 start app.js --env production` or use `--env-file .env`.

### 4. **Env var name typo**
`sampole.env` uses `node_mailer_user` (lowercase). Code expects `NODE_MAILER_USER`. On Linux, env vars are case-sensitive.

**Fix:** Use exactly `NODE_MAILER_USER` and `NODE_MAILER_PASSWORD` in `.env`.

### 5. **No explicit TLS/connection settings**
Nodemailer defaults can behave differently on VPS networks (NAT, stricter firewalls).

**Fix:** Add explicit `secure`, `requireTLS`, `host`, and timeouts.

### 6. **Fire-and-forget calls (no await)**
`sendPartnershipWelcomeEmail` and `sendAdminLoginNotification` are called **without await** in controllers. Errors are never caught and the API returns before the email is sent.

---

## Test Email on VPS

```bash
# On your Ubuntu VPS, from project root:
npm run test:email
```

Set `TEST_EMAIL=your@email.com` in `.env` to receive a test message. Check logs for `[Email]` errors.

---

## Code Fixes Applied

- Explicit SMTP config (host, secure, requireTLS, timeouts)
- Debug mode: set `EMAIL_DEBUG=true` in `.env` for verbose logs
- Error logging for all send failures
- `.catch()` on fire-and-forget emails so failures are logged
- `verifyEmailConnection()` helper for testing
