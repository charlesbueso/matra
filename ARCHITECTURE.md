# MATRA — Architecture Document

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │  iOS (RN)    │  │ Android (RN) │  │  Web (future)      │     │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘     │
│         │                 │                    │                  │
│         └────────────┬────┴────────────────────┘                 │
│                      │ HTTPS / WSS                               │
├──────────────────────┼───────────────────────────────────────────┤
│                      ▼                                           │
│  ┌─────────────────────────────────┐                             │
│  │        Supabase Edge Gateway     │  ← Auth, Rate Limiting     │
│  │        (Kong + GoTrue)           │                             │
│  └──────────────┬──────────────────┘                             │
│                 │                                                 │
│    ┌────────────┼────────────────────────────┐                   │
│    │            │                            │                   │
│    ▼            ▼                            ▼                   │
│  ┌──────┐  ┌──────────────┐  ┌──────────────────────────┐       │
│  │ Auth │  │  REST API     │  │  Edge Functions           │       │
│  │(GoTrue│  │  (PostgREST) │  │  (Deno / TypeScript)      │       │
│  └──────┘  └──────┬───────┘  │                            │       │
│                   │          │  • /process-interview       │       │
│                   │          │  • /extract-entities        │       │
│                   │          │  • /generate-summary        │       │
│                   │          │  • /generate-biography      │       │
│                   │          │  • /validate-subscription   │       │
│                   │          │  • /export-memory-book      │       │
│                   │          └─────────────┬──────────────┘       │
│                   │                        │                     │
│    ┌──────────────┴────────────────────────┤                     │
│    │                                       │                     │
│    ▼                                       ▼                     │
│  ┌──────────────────────┐  ┌──────────────────────────────┐     │
│  │   PostgreSQL (Supabase│  │   AI Provider Abstraction    │     │
│  │   managed)            │  │                              │     │
│  │                       │  │   ┌────────┐ ┌────────┐     │     │
│  │   • users             │  │   │ OpenAI │ │ Groq   │     │     │
│  │   • interviews        │  │   └────────┘ └────────┘     │     │
│  │   • transcripts       │  │   ┌──────────┐ ┌──────┐    │     │
│  │   • people            │  │   │Anthropic │ │Whisper│    │     │
│  │   • relationships     │  │   └──────────┘ └──────┘    │     │
│  │   • stories           │  │   ┌───────────────────┐    │     │
│  │   • subscriptions     │  │   │ Deepgram (STT)    │    │     │
│  │   • family_groups     │  │   └───────────────────┘    │     │
│  └──────────────────────┘  └──────────────────────────────┘     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Supabase Storage (S3-compatible)             │   │
│  │                                                           │   │
│  │   /audio      — interview recordings                      │   │
│  │   /exports    — PDF memory books                          │   │
│  │   /avatars    — profile photos                            │   │
│  │   /media      — photos, documents attached to stories     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Background Job Queue                         │   │
│  │              (Supabase pg_cron + Edge Functions)           │   │
│  │                                                           │   │
│  │   • Long-running transcriptions                           │   │
│  │   • Batch entity extraction                               │   │
│  │   • PDF generation                                        │   │
│  │   • Video documentary generation (future)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Stack Choices & Justification

### Frontend: React Native with Expo (managed workflow)

**Why Expo:**
- EAS Build handles iOS/Android builds without local Xcode/Android Studio
- Expo Router for file-based navigation (aligns with modern patterns)
- expo-av for audio recording — battle-tested
- expo-in-app-purchases / react-native-purchases (RevenueCat) for subscriptions
- OTA updates via expo-updates
- 90% of what we need is supported in managed workflow
- If we ever need native modules, we can eject partially via config plugins

**Key Libraries:**
- `expo-router` — file-based navigation
- `expo-av` — audio recording/playback
- `react-native-reanimated` — smooth animations (star fields, graph transitions)
- `react-native-skia` — constellation graph rendering (GPU-accelerated)
- `react-native-purchases` (RevenueCat) — cross-platform subscription management
- `@supabase/supabase-js` — backend client
- `zustand` — lightweight state management
- `react-native-mmkv` — fast local storage
- `expo-secure-store` — sensitive data (tokens)

### Backend: Supabase (self-hosted option later)

**Why Supabase over Firebase:**
- PostgreSQL (relational) is far better for genealogical graph data than Firestore (document)
- Row-Level Security (RLS) handles multi-tenant access without custom middleware
- Edge Functions (Deno) for AI processing pipelines
- Built-in auth (email, social, magic link)
- S3-compatible storage with CDN
- Realtime subscriptions for collaborative editing (future)
- Can self-host later if costs grow (exit strategy from vendor lock-in)
- PostgREST auto-generates REST API from schema — less boilerplate

**Why NOT Firebase:**
- Document model is wrong for graph/relational data
- Firestore pricing gets expensive with reads at scale
- Harder to do complex queries (joins, graph traversals)
- Vendor lock-in with no self-host option

### AI Layer: Provider-Agnostic Abstraction

- TypeScript interfaces define capabilities (transcribe, extract, summarize, generate)
- Adapter pattern: each provider implements the interface
- Configuration selects active provider per capability
- Can use different providers for different tasks (e.g., Whisper for STT, Claude for extraction)

### Subscription: RevenueCat

**Why RevenueCat instead of raw StoreKit/Billing:**
- Unified API for Apple + Google
- Webhook-based server validation
- Built-in analytics
- Handles edge cases (grace periods, billing retry, family sharing)
- Free up to $2,500/month MTR

## 3. Security Considerations

1. **Auth**: Supabase GoTrue (bcrypt passwords, JWT tokens, refresh rotation)
2. **RLS**: Every table has row-level security policies — users can only access their own data
3. **API Keys**: AI provider keys stored in Supabase Vault (encrypted at rest)
4. **Audio Encryption**: Audio files encrypted at rest in Supabase Storage
5. **Subscription Validation**: Server-side only — never trust client claims
6. **Rate Limiting**: Edge function rate limits per user to prevent AI abuse
7. **Input Sanitization**: All LLM inputs sanitized to prevent prompt injection
8. **HTTPS Only**: All traffic encrypted in transit
9. **Family Sharing**: Invitation-based with role-based access (owner, editor, viewer)
10. **Data Deletion**: Full GDPR-compliant data deletion pipeline (user requests → cascade delete all data)

## 4. Scaling Plan

### Phase 1: 0–1,000 users (MVP)
- Supabase Free/Pro tier ($25/month)
- Single Supabase project
- Edge Functions handle all AI processing
- RevenueCat free tier
- **Estimated infra cost: $25–75/month**

### Phase 2: 1,000–10,000 users
- Supabase Pro tier with compute add-ons
- Connection pooling (PgBouncer built into Supabase)
- CDN for media (Supabase Storage CDN or Cloudflare)
- Consider dedicated AI processing queue (BullMQ on Railway/Fly.io)
- **Estimated infra cost: $200–500/month**

### Phase 3: 10,000–100,000 users
- Self-hosted Supabase on AWS/GCP OR Supabase Enterprise
- Read replicas for heavy graph queries
- Dedicated media processing service
- Audio transcription queue with workers
- Redis for caching subscription states + feature flags
- **Estimated infra cost: $1,000–3,000/month**

### Phase 4: 100,000+ users
- Microservice decomposition if needed
- Dedicated graph database (Neo4j) alongside PostgreSQL for complex queries
- Global CDN for media
- Multi-region deployment
- **Estimated infra cost: $5,000–15,000/month**

## 5. Cost Estimates (Monthly)

### 100 Users
| Item | Cost |
|------|------|
| Supabase Pro | $25 |
| AI (transcription) | ~$15 (est. 50 interviews × ~5min avg) |
| AI (LLM processing) | ~$10 |
| RevenueCat | $0 |
| Domain + misc | $5 |
| **Total** | **~$55/month** |

### 1,000 Users
| Item | Cost |
|------|------|
| Supabase Pro + addons | $75 |
| AI (transcription) | ~$150 |
| AI (LLM processing) | ~$100 |
| RevenueCat | $0 (under $2,500 MTR) |
| Storage | ~$25 |
| **Total** | **~$350/month** |

### 10,000 Users
| Item | Cost |
|------|------|
| Supabase Team/Enterprise | $400 |
| AI (transcription) | ~$1,500 |
| AI (LLM processing) | ~$800 |
| RevenueCat (1% over $2,500) | ~$50 |
| Storage + CDN | ~$200 |
| **Total** | **~$2,950/month** |

## 6. Realistic Assessment

### Technical Difficulty: 7/10
- Audio recording + transcription pipeline is well-solved
- LLM entity extraction is the hardest part — needs careful prompt engineering and validation
- Graph visualization on mobile (performant, beautiful) is non-trivial
- Subscription management has many edge cases
- The "magic" feeling (emotional, cinematic) requires significant design polish

### Cost Risk: LOW-MEDIUM
- AI costs scale linearly with usage — mitigated by feature gating (free tier limits)
- Supabase is cheap early, predictable scaling
- Biggest cost risk: heavy LLM usage by power users → mitigate with rate limits and caching

### Biggest Product Risks:
1. **Accuracy of entity extraction** — if AI gets relationships wrong, trust is destroyed
2. **Onboarding friction** — users need to record an interview immediately to see value; cold start problem
3. **Emotional quality** — if it doesn't FEEL special, it's just another genealogy app
4. **Audio quality** — phone recordings in noisy environments → bad transcription → bad extraction
5. **Retention** — family trees are "build once" — need recurring value (story features, sharing, new interviews)

### What Must Go Right for $5K/month:
- At $10/month average, need 500 paying subscribers
- At 5% conversion rate, need 10,000 total users
- Need viral family sharing (1 user invites 3-5 family members)
- Need the "interview moment" to be so emotional that users share on social media
- Need clean app store presence with 4.5+ stars
- TikTok/Instagram organic content showing emotional interview moments

### What Would Kill It:
- Apple/Google rejecting the app for subscription policy violations
- AI extraction being consistently wrong (names, relationships)
- Privacy breach (family data is deeply sensitive)
- Competitor with deeper pockets (StoryCorps, Ancestry.com) adding same feature
- LLM costs spiking without corresponding revenue
- Users finding the voice recording step too awkward/uncomfortable
