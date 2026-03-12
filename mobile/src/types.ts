// ============================================================
// MATRA — Shared Client Types
// ============================================================

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired' | 'grace_period' | 'billing_retry';

/** Describes downgrade/grace-period state for lapsed premium users. */
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
export type InterviewStatus = 'draft' | 'uploading' | 'transcribing' | 'extracting' | 'summarising' | 'complete' | 'failed';
export type RelationshipType =
  | 'parent' | 'child' | 'sibling' | 'spouse' | 'ex_spouse'
  | 'grandparent' | 'grandchild'
  | 'great_grandparent' | 'great_grandchild'
  | 'great_great_grandparent' | 'great_great_grandchild'
  | 'uncle_aunt' | 'nephew_niece' | 'cousin'
  | 'step_parent' | 'step_child' | 'step_sibling' | 'half_sibling' | 'in_law' | 'parent_in_law' | 'child_in_law'
  | 'adopted_parent' | 'adopted_child'
  | 'godparent' | 'godchild'
  | 'other';

export interface FeatureLimits {
  max_interviews: number;        // -1 = unlimited
  max_audio_minutes: number;
  max_family_members: number;    // -1 = unlimited
  max_storage_mb: number;
  can_export: boolean;
  can_generate_biography: boolean;
  can_generate_documentary: boolean;
  ai_summary: boolean;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  interview_count: number;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface FamilyGroup {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  member_count?: number;
}

export interface Person {
  id: string;
  family_group_id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  ai_biography: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Relationship {
  id: string;
  family_group_id: string;
  person_a_id: string;
  person_b_id: string;
  relationship_type: RelationshipType;
  verified: boolean;
  confidence_score: number;
}

export interface Interview {
  id: string;
  family_group_id: string;
  person_id: string;
  title: string;
  audio_url: string | null;
  duration_seconds: number | null;
  status: InterviewStatus;
  recorded_at: string;
  created_at: string;
}

export interface Story {
  id: string;
  family_group_id: string;
  interview_id: string;
  title: string;
  content: string;
  time_period: string | null;
  location: string | null;
  ai_generated: boolean;
  created_at: string;
}
