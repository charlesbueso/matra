# Matra — Local Development Setup

A living archive of your ancestry. Dark neon interstellar ocean meets bioluminescent ecosystem.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 18+ LTS | [nodejs.org](https://nodejs.org) |
| **npm** | 9+ | Comes with Node.js |
| **Expo CLI** | Latest | `npm install -g expo-cli` |
| **Supabase CLI** | 1.100+ | `npm install -g supabase` |
| **Docker Desktop** | Latest | [docker.com](https://www.docker.com/products/docker-desktop) (required for local Supabase) |
| **iOS Simulator** | Xcode 15+ | Mac only — App Store → Xcode |
| **Android Emulator** | API 33+ | [Android Studio](https://developer.android.com/studio) |

---

## 1. Clone & Install Dependencies

```bash
git clone <your-repo-url> galactic-tree
cd galactic-tree

# Backend dependencies
cd backend
npm install

# Mobile dependencies
cd ../mobile
npm install
```

---

## 2. Start Local Supabase

Make sure Docker Desktop is running, then:

```bash
cd backend
supabase start
```

This spins up local Postgres, Auth, Storage, Edge Functions, and Studio.  
After startup you'll see output like:

```
API URL:     http://127.0.0.1:54321
Anon Key:    eyJhb...
Service Key: eyJhb...
Studio URL:  http://127.0.0.1:54323
```

**Save these values** — you'll need them in step 4.

### Apply the database schema

The migration runs automatically on `supabase start`, but you can reset if needed:

```bash
supabase db reset
```

This applies `supabase/migrations/00001_initial_schema.sql` which creates all tables: `profiles`, `family_groups`, `people`, `relationships`, `interviews`, `stories`, etc.

---

## 3. Serve Edge Functions Locally

In a separate terminal:

```bash
cd backend
supabase functions serve --env-file .env.local
```

Create `backend/.env.local` with your AI provider keys:

```env
# At least one AI provider is required
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# Optional — defaults to OpenAI if set
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
```

The 5 Edge Functions will be available at `http://127.0.0.1:54321/functions/v1/`:
- `process-interview` — Transcribe + extract people, relationships, stories
- `generate-biography` — AI-written biography for a person
- `export-memory-book` — Generate PDF memory book
- `validate-subscription` — Check RevenueCat entitlements
- `get-entitlements` — Return user's subscription tier

---

## 4. Configure Mobile App

Create the environment config in the mobile app. The app reads from `expo-constants` extras in `app.json`:

Open `mobile/app.json` and fill in the `extra` section:

```json
{
  "expo": {
    "extra": {
      "supabaseUrl": "http://127.0.0.1:54321",
      "supabaseAnonKey": "<your-local-anon-key-from-step-2>",
      "revenueCatApiKey": "appl_YOUR_KEY"
    }
  }
}
```

> **Tip:** For physical device testing, replace `127.0.0.1` with your machine's LAN IP (e.g. `192.168.1.100`).

---

## 5. Run the Mobile App

```bash
cd mobile
npx expo start
```

Then press:
- `i` — Open in iOS Simulator
- `a` — Open in Android Emulator
- Scan QR code — Open on physical device (requires Expo Go)

### Development Build (recommended for full native module support)

```bash
npx expo prebuild
npx expo run:ios    # or run:android
```

---

## 6. Verify Everything Works

1. **Supabase Studio**: Open `http://127.0.0.1:54323` — you should see all tables
2. **Sign up**: Create an account in the app's Welcome screen
3. **Record**: Try recording an interview (requires microphone permission)
4. **Edge Functions**: Check the terminal running `supabase functions serve` for logs

---

## Project Structure

```
galactic-tree/
├── ARCHITECTURE.md          # Full system architecture
├── BUILD_PLAN.md            # MVP build plan
├── SETUP.md                 # This file
├── backend/
│   ├── package.json
│   └── supabase/
│       ├── config.toml      # Supabase local config
│       ├── migrations/      # SQL schema
│       └── functions/       # Edge Functions
│           ├── _shared/     # AI abstraction layer
│           ├── process-interview/
│           ├── generate-biography/
│           ├── export-memory-book/
│           ├── validate-subscription/
│           └── get-entitlements/
└── mobile/
    ├── app.json             # Expo config
    ├── package.json
    ├── tsconfig.json
    ├── app/                 # Expo Router screens
    │   ├── _layout.tsx
    │   ├── index.tsx
    │   ├── paywall.tsx
    │   ├── (auth)/          # Auth flow
    │   ├── (onboarding)/    # First-run onboarding
    │   ├── (tabs)/          # Main tab navigation
    │   ├── person/          # Person detail [id]
    │   └── story/           # Story detail [id]
    └── src/
        ├── theme/           # Design tokens & theme
        ├── components/ui/   # Reusable UI components
        ├── stores/          # Zustand state stores
        ├── hooks/           # Custom React hooks
        ├── services/        # API service layer
        └── types/           # TypeScript types
```

---

## Common Issues

| Problem | Solution |
|---------|----------|
| `supabase start` fails | Make sure Docker Desktop is running |
| Fonts not loading | Run `npx expo install expo-font` and restart |
| Edge Functions 500 | Check `.env.local` has valid AI API keys |
| Microphone denied | Reset permissions in device settings |
| Android build fails | Ensure `ANDROID_HOME` env var is set |
| Network errors on device | Use LAN IP instead of `localhost` in `supabaseUrl` |

---

## Useful Commands

```bash
# Type-check the mobile app
cd mobile && npm run typecheck

# Generate Supabase TypeScript types
cd backend && npm run types

# Reset local database
cd backend && supabase db reset

# Stop local Supabase
cd backend && supabase stop

# Deploy Edge Functions (production)
cd backend && supabase functions deploy
```
