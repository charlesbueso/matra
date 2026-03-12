# Resend SMTP Setup for Matra (Supabase Auth)

## Why Resend?
- **Free tier**: 100 emails/day, 3,000/month, 1 custom domain
- **Scales**: $20/mo Pro = 50,000 emails/month
- **Works with Supabase**: Native SMTP support, no edge function needed

---

## Step 1 — Create Resend Account

1. Go to [resend.com](https://resend.com) and sign up
2. You start on the **Free** plan automatically

## Step 2 — Add & Verify Your Domain

1. In Resend dashboard → **Domains** → **Add Domain**
2. Enter your domain: `matra.live`
3. Add the DNS records Resend gives you:
   - **MX record** — for receiving (optional, only if you want to receive)
   - **TXT record** — SPF verification
   - **CNAME records** — DKIM signing (usually 3 records)
4. Click **Verify** — can take a few minutes to propagate
5. Wait until status shows **Verified** ✅

> **Tip**: While waiting for domain verification, you can test with `onboarding@resend.dev` as the sender (Resend's sandbox address).

## Step 3 — Create an API Key

1. In Resend dashboard → **API Keys** → **Create API Key**
2. Name it something like `matra-supabase-smtp`
3. Permission: **Sending access** (Full access also works)
4. Restrict to your domain for security
5. Copy the key — it looks like `re_xxxxxxxxxxxx`

> **Save this key securely** — you won't be able to see it again.

## Step 4 — Configure Supabase SMTP

### In the Supabase Dashboard:

1. Go to your project → **Authentication** → **Email Templates**
2. For each template type, paste the HTML from `backend/supabase/templates/`:
   - **Confirm signup** → `confirm-signup.html`
   - **Reset password** → `reset-password.html`  
   - **Magic link** → `magic-link.html`
   - **Change email** → `change-email.html`
   - **Invite user** → `invite.html`

3. Go to **Authentication** → **SMTP Settings** → toggle **Enable Custom SMTP**
4. Fill in:

| Setting          | Value                           |
|------------------|---------------------------------|
| **Sender email** | `support@matra.live`            |
| **Sender name**  | `Matra`                         |
| **Host**         | `smtp.resend.com`               |
| **Port**         | `465`                           |
| **Username**     | `resend`                        |
| **Password**     | `re_YOUR_API_KEY` (from Step 3) |

5. **Minimum interval**: Leave at 60s (prevents abuse)
6. Click **Save**

## Step 5 — Test It

1. Create a test account in your app with a real email
2. Check that the confirmation email arrives with Matra branding
3. Test password reset flow
4. Check Resend dashboard → **Emails** to see delivery logs

---

## Template Files

All templates are in `backend/supabase/templates/`:

| File                    | Supabase Template Type | Subject Line                           |
|-------------------------|------------------------|----------------------------------------|
| `confirm-signup.html`   | Confirm signup         | Confirm your email — Matra 🌳         |
| `reset-password.html`   | Reset password         | Reset your password — Matra 🌳        |
| `magic-link.html`       | Magic link             | Your login link — Matra 🌳            |
| `change-email.html`     | Change email address   | Confirm your new email — Matra 🌳     |
| `invite.html`           | Invite user            | You're invited to Matra 🌳            |

All templates use:
- Matra's design tokens (parchment background `#F7F2EA`, forest green `#6B8F3C`, bark brown `#3B2E1E`)
- `{{ .ConfirmationURL }}` — Supabase's Go template variable for the action link
- Responsive layout, Outlook-safe (MSO conditionals), dark mode friendly
- Fallback plain-text URL below the button

---

## Resend Free Tier Limits

| Limit             | Free    | Pro ($20/mo) |
|--------------------|---------|--------------|
| Emails/day         | 100     | 50,000/mo    |
| Emails/month       | 3,000   | 50,000       |
| Custom domains     | 1       | Unlimited    |
| Suppression lists  | ✅      | ✅           |
| Webhooks           | ✅      | ✅           |
| Analytics          | ✅      | ✅           |

For a family storytelling app, the free tier should cover you well into launch. You'd need Pro only once you have ~100 daily active signups or password resets.

---

## Troubleshooting

| Issue                          | Fix                                                        |
|--------------------------------|-------------------------------------------------------------|
| Emails going to spam           | Make sure DKIM/SPF DNS records are verified in Resend       |
| `{{ .ConfirmationURL }}` shows as text | You're not in Supabase's template editor — paste the HTML there |
| "Invalid sender" error         | Domain must be verified in Resend; sender must use `matra.live` |
| No emails arriving             | Check Resend dashboard logs; verify API key is correct      |
| Rate limited                   | Free tier = 100/day; check Resend dashboard for quota usage |
