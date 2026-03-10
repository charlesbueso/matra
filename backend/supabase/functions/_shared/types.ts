// ============================================================
// Matra — Shared Types
// ============================================================
// These types are shared across all Edge Functions.
// Generated DB types will supplement these application-level types.
// ============================================================

// ── Subscription & Feature Gating ──

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'grace_period' | 'billing_retry';

/** Describes how a lapsed premium user should be treated. */
export interface DowngradeInfo {
  /** User was previously premium and is now on free tier. */
  isLapsed: boolean;
  /** True while in 7-day grace period — full premium access. */
  inGracePeriod: boolean;
  /** When the grace period expires (null if not applicable). */
  gracePeriodEndsAt: string | null;
  /** Lapsed users can still export until this date (30 days from expiration). */
  exportAccessUntil: string | null;
}

export interface FeatureLimits {
  maxInterviews: number;
  maxInterviewsPerMonth: number;
  maxInterviewsPerDay: number;
  maxRecordingSeconds: number;
  maxStoriesPerInterview: number;
  aiSummarization: boolean;
  aiBiography: boolean;
  audioSnippets: boolean;
  memoryBookExport: boolean;
  familySharing: boolean;
  encryptedArchive: boolean;
  documentaryGeneration: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, FeatureLimits> = {
  free: {
    maxInterviews: 2,
    maxInterviewsPerMonth: Infinity,
    maxInterviewsPerDay: Infinity,
    maxRecordingSeconds: 5 * 60, // 5 minutes
    maxStoriesPerInterview: 1,
    aiSummarization: false,
    aiBiography: false,
    audioSnippets: false,
    memoryBookExport: false,
    familySharing: false,
    encryptedArchive: false,
    documentaryGeneration: false,
  },
  premium: {
    maxInterviews: Infinity,
    maxInterviewsPerMonth: 30,
    maxInterviewsPerDay: 5,
    maxRecordingSeconds: 30 * 60, // 30 minutes
    maxStoriesPerInterview: 5,
    aiSummarization: true,
    aiBiography: true,
    audioSnippets: true,
    memoryBookExport: true,
    familySharing: true,
    encryptedArchive: true,
    documentaryGeneration: true,
  },
};

// ── AI Provider Types ──

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  words: Array<{
    word: string;
    start_ms: number;
    end_ms: number;
    confidence: number;
  }>;
  speakers?: Array<{
    id: string;
    segments: Array<{ start_ms: number; end_ms: number }>;
  }>;
}

export interface ExtractedEntity {
  type: 'person' | 'date' | 'location' | 'event' | 'relationship';
  value: string;
  confidence: number;
  context: string;
  metadata?: Record<string, unknown>;
}

export interface ExtractedRelationship {
  personA: string;
  personB: string;
  relationshipType: string;
  confidence: number;
  context: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  suggestedPeople: Array<{
    firstName: string;
    lastName?: string;
    nickname?: string;
    birthDate?: string;
    deathDate?: string;
    birthPlace?: string;
    currentLocation?: string;
    profession?: string;
    isDeceased?: boolean;
  }>;
}

export interface SummaryResult {
  summary: string;
  keyTopics: string[];
  emotionalTone: string;
  suggestedStories: Array<{
    title: string;
    content: string;
    involvedPeople: string[];
    approximateDate?: string;
    location?: string;
    keyMoments?: Array<{
      quote: string;
      label: string;
    }>;
  }>;
}

export interface BiographyResult {
  biography: string;
  wordCount: number;
}

// ── API Response Types ──

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ── Processing Job Types ──

export type JobType = 'transcribe' | 'extract' | 'summarize' | 'biography' | 'export';

export interface ProcessingJobPayload {
  transcribe: { interviewId: string; audioPath: string };
  extract: { interviewId: string; transcriptId: string };
  summarize: { interviewId: string; transcriptId: string };
  biography: { personId: string; familyGroupId: string };
  export: { exportId: string; familyGroupId: string; exportType: string };
}
