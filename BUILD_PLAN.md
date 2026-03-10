# Matra — MVP Build Plan

> Step-by-step execution guide. Each sprint = 1 week.  
> Total MVP timeline: **8-10 weeks** (solo dev) or **5-6 weeks** (2 devs).

---

## Sprint 0 — Project Bootstrap (Days 1-2)

### Dev Environment
- [ ] Clone repo, `cd mobile && npm install`, `cd backend && npm install`
- [ ] Install Supabase CLI: `npx supabase init` (already configured)
- [ ] Start local Supabase: `npx supabase start`
- [ ] Run migration: `npx supabase db reset`
- [ ] Verify tables in local Studio (`http://localhost:54323`)
- [ ] Create `.env` files for both `mobile/` and `backend/`

### Accounts
- [ ] Supabase project (free tier) — get URL + anon key
- [ ] RevenueCat account — create project, add iOS + Android apps
- [ ] OpenAI API key (for Whisper + GPT-4o)
- [ ] Apple Developer ($99/yr) — required for TestFlight
- [ ] Google Play Console ($25 one-time) — required for closed testing
- [ ] EAS account: `npx eas-cli login && eas build:configure`

### Deliverable
Local Supabase running, Expo dev client boots on simulator, all env vars set.

---

## Sprint 1 — Auth & Onboarding (Week 1)

### Tasks
- [ ] Configure Supabase GoTrue (email + Apple Sign-In + Google Sign-In)
- [ ] Wire up `sign-in.tsx` / `sign-up.tsx` to real Supabase auth
- [ ] Implement secure session persistence with `expo-secure-store`
- [ ] Build onboarding flow (4 screens → family group creation)
- [ ] Profile creation trigger (verify `handle_new_user` DB trigger works)
- [ ] Auto-create first family group on onboarding complete
- [ ] Set `onboarding_completed = true` in profile

### Acceptance Criteria
- User can sign up with email, sign in, and see the home tab
- Session persists across app restarts
- First-time users see onboarding; returning users go straight to tabs
- Profile and family group exist in DB after onboarding

---

## Sprint 2 — Family Graph CRUD (Week 2)

### Tasks
- [ ] People CRUD: add person, edit details, delete (soft)
- [ ] Relationship CRUD: add relationship between two people
- [ ] Family group member invites (share join code)
- [ ] Constellation (tree) view rendering with SVG
- [ ] Tap node → navigate to person detail screen
- [ ] Tap line → show relationship type

### Acceptance Criteria
- Can add/edit/delete family members
- Constellation renders nodes and lines correctly
- Tapping elements navigates to detail views
- RLS enforced: user only sees own family group data

---

## Sprint 3 — Audio Recording & Upload (Week 3)

### Tasks
- [ ] Integrate `audioRecorder.ts` service with record screen
- [ ] Real-time waveform visualization during recording
- [ ] Timer display (MM:SS)
- [ ] Free tier: enforce 10-minute limit client-side + server-side
- [ ] Upload audio to Supabase Storage (`audio/{family_group_id}/{interview_id}.m4a`)
- [ ] Create interview record in DB with status `uploading`
- [ ] Show upload progress indicator
- [ ] Handle retry on upload failure

### Acceptance Criteria
- Can record audio with live waveform feedback
- Recording stops at tier limit
- File uploads to Supabase Storage
- Interview appears in DB with correct metadata

---

## Sprint 4 — AI Processing Pipeline (Week 4)

### Tasks
- [ ] Deploy `process-interview` Edge Function to Supabase
- [ ] Wire recording completion → invoke Edge Function
- [ ] Whisper transcription (OpenAI or Groq)
- [ ] Entity extraction (people, dates, places, relationships)
- [ ] Auto-create people nodes and relationships from extraction
- [ ] Generate story summaries (premium gate check)
- [ ] Store transcript, entities, stories in DB
- [ ] Realtime subscription: interview status updates on home screen
- [ ] Error handling: retry logic, user-facing error states

### Acceptance Criteria
- After recording, interview status progresses: uploading → transcribing → extracting → summarising → complete
- People auto-appear in constellation
- Stories appear in Stories tab
- Free users get transcription + extraction; premium get summaries
- Failed jobs show error state with retry option

---

## Sprint 5 — Stories & Biography (Week 5)

### Tasks
- [ ] Story detail screen with full content, people pills, source interview
- [ ] Person detail screen with biography, relationships, stories
- [ ] Deploy `generate-biography` Edge Function
- [ ] "Generate Biography" button (premium gated)
- [ ] Story scroll/browse with search/filter
- [ ] Empty states for all lists

### Acceptance Criteria
- Story detail renders correctly with linked people
- Person detail shows all related data
- Biography generation works end-to-end for premium users
- Free users see paywall when attempting premium features

---

## Sprint 6 — Subscription & Paywall (Week 6)

### Tasks
- [ ] RevenueCat SDK integration in React Native
- [ ] Configure products in App Store Connect + Google Play Console
- [ ] Paywall screen with real IAP purchase flow
- [ ] Deploy `validate-subscription` Edge Function (RevenueCat webhook)
- [ ] Set webhook URL in RevenueCat dashboard
- [ ] Entitlements sync: purchase → webhook → DB update → client refresh
- [ ] Restore purchases flow
- [ ] Subscription management in Settings
- [ ] Grace period handling for billing issues

### Acceptance Criteria
- Can purchase monthly ($9.99) and lifetime ($49.99) plans
- Subscription status updates in DB within seconds
- Feature gates unlock immediately after purchase
- Restore purchases works for existing subscribers
- Cancellation/expiration handled gracefully

---

## Sprint 7 — Polish & Edge Cases (Week 7)

### Tasks
- [ ] Offline support: MMKV cache for last-loaded data
- [ ] Pull-to-refresh on all list screens
- [ ] Loading skeletons for all async states
- [ ] Error boundaries with retry
- [ ] Haptic feedback on key interactions
- [ ] Star field performance optimization (reduce count on low-end devices)
- [ ] Deep link handling (`galactictree://person/{id}`)
- [ ] Accessibility: VoiceOver labels, dynamic type support
- [ ] App icon and splash screen generation

### Acceptance Criteria
- App feels responsive under poor network conditions
- No unhandled crashes or blank error states
- VoiceOver reads all interactive elements
- Deep links open correct screens

---

## Sprint 8 — Testing & Launch Prep (Week 8)

### Tasks
- [ ] E2E tests: auth flow, record + process, subscription purchase
- [ ] Unit tests: stores, hooks, feature gating logic
- [ ] Edge Function tests: process-interview, validate-subscription
- [ ] Privacy policy + Terms of Service pages
- [ ] App Store metadata: screenshots, description, keywords
- [ ] EAS Build: production builds for iOS + Android
- [ ] TestFlight internal testing (minimum 5 testers, 3 days)
- [ ] Google Play closed testing track
- [ ] Supabase production project setup (migrate schema, set env vars)
- [ ] Set up monitoring: Sentry for crash reporting
- [ ] RevenueCat production mode

### Acceptance Criteria
- All critical paths tested on real devices
- App builds pass Apple + Google review requirements
- Production Supabase project running with correct RLS
- Monitoring active and capturing events

---

## Sprint 9-10 — Beta & Launch

### Beta (Sprint 9)
- [ ] TestFlight public link / Google Play open testing
- [ ] Collect feedback from 20-50 beta users
- [ ] Fix top 5 reported issues
- [ ] Performance profiling (Hermes bytecode, JS bundle size)
- [ ] A/B test paywall copy + pricing

### Launch (Sprint 10)
- [ ] Submit to App Store (allow 2-5 days for review)
- [ ] Submit to Google Play (allow 1-3 days for review)
- [ ] Landing page live with App Store links
- [ ] Analytics: track interview_completed, subscription_started, biography_generated
- [ ] Post-launch monitoring for 72 hours

---

## Post-MVP Roadmap

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Photo attachments to people/stories | 1 week | High |
| P0 | Push notifications (interview complete) | 3 days | Medium |
| P1 | Family sharing (multi-user family group) | 2 weeks | High |
| P1 | Memory Book PDF export | 1 week | Medium |
| P1 | Interview question prompts (AI-generated) | 3 days | High |
| P2 | Documentary script generation | 1 week | Medium |
| P2 | Timeline view (chronological stories) | 1 week | Medium |
| P2 | Audio playback with highlighted transcript | 1 week | High |
| P3 | Web app companion | 6+ weeks | Medium |
| P3 | Video interview support | 3 weeks | Medium |

---

## Cost Estimates by Scale

### 100 Users (Month 1-3)
| Service | Monthly Cost |
|---------|-------------|
| Supabase Free | $0 |
| OpenAI (Whisper + GPT-4o) | ~$15-30 |
| RevenueCat | $0 (free under $2.5K MTR) |
| Apple Developer | $8.25/mo ($99/yr) |
| EAS Build (free tier) | $0 |
| **Total** | **~$25-40/mo** |

### 1,000 Users (Month 4-8)
| Service | Monthly Cost |
|---------|-------------|
| Supabase Pro | $25 |
| OpenAI | ~$150-300 |
| Groq (if switching STT) | ~$30-50 |
| RevenueCat | $0 |
| Sentry | $0 (free tier) |
| **Total** | **~$200-375/mo** |

### 10,000 Users (Month 9-18)
| Service | Monthly Cost |
|---------|-------------|
| Supabase Pro + compute add-ons | $75-150 |
| OpenAI / mixed providers | ~$800-1,500 |
| RevenueCat | $0 (still under $2.5K usually) |
| CDN / Cloudflare | $20 |
| Sentry Teams | $26 |
| **Total** | **~$950-1,700/mo** |

### Revenue vs Cost (10K users, 5% conversion @ $9.99/mo)
- Projected MRR: **500 × $9.99 = $4,995/mo** (minus 30% Apple/Google cut = ~$3,497 net)
- Projected costs: ~$1,300/mo
- **Gross margin: ~63%** ← healthy for this stage

---

## Kill Factors — Watch Out For

1. **Audio processing costs scale linearly** → Mitigate by switching to Groq (10x cheaper) for STT once quality is validated
2. **App Store review rejection** → Common for subscription apps; have clear restore purchases, ToS links, and price display
3. **AI hallucination in family data** → Always show confidence scores, let users verify/correct extracted entities
4. **Single-developer bus factor** → Document everything, use managed services, avoid custom infra
5. **Churn after free trial** → The 5-interview free tier is your hook; make the first experience magical

---

## Environment Variables Reference

### Backend (Supabase Edge Functions)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
AI_STT_PROVIDER=openai          # openai | groq
AI_LLM_PROVIDER=openai          # openai | anthropic | groq
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
REVENUECAT_WEBHOOK_AUTH_TOKEN=your-webhook-secret
```

### Mobile (Expo)
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
```
