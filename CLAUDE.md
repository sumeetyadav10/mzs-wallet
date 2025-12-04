# MZS Wallet Admin Configuration

## Admin Session Duration

The admin session duration is now configurable via environment variable:

```bash
# Set admin session duration in hours (default: 24 hours)
ADMIN_SESSION_DURATION_HOURS=24
```

## Why Sessions Expire

Admin sessions expire for security reasons. The default was 8 hours but has been updated to 24 hours. Sessions will expire:

1. After the configured duration (24 hours by default)
2. When manually logging out
3. When device fingerprint changes (security protection)

## Session Expiration Logs

When a session expires, you'll see logs like:
```
📅 Session time check {
  createdAt: 2025-12-03T08:08:46.465Z,
  expiresAt: 2025-12-04T08:08:46.465Z,  // 24 hours later
  now: 2025-12-04T10:03:47.353Z,
  isExpired: true,
  hoursRemaining: -2.1,
  sessionDurationHours: 24
}
```

## Recommended Actions

1. Set `ADMIN_SESSION_DURATION_HOURS` in your `.env.local` file to your preferred duration
2. For development, you might want longer sessions (e.g., 48 or 72 hours)
3. For production, keep it at 24 hours or less for security

## Commands to Run

After making changes:
```bash
npm run dev
# or
npm run build && npm start
```