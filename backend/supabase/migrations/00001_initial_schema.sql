-- ============================================================
-- MATRA — Initial Database Schema
-- ============================================================
-- Design principles:
-- 1. All tables have RLS enabled
-- 2. UUIDs for all primary keys (distributed-friendly)
-- 3. Soft deletes via deleted_at where appropriate
-- 4. created_at/updated_at on everything
-- 5. JSONB for flexible metadata without schema migrations
-- 6. Proper indexes for query patterns we'll actually use
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE subscription_tier AS ENUM ('free', 'premium', 'lifetime');
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled', 'grace_period', 'billing_retry');
CREATE TYPE interview_status AS ENUM ('recording', 'uploading', 'transcribing', 'processing', 'completed', 'failed');
CREATE TYPE processing_stage AS ENUM ('queued', 'transcribing', 'extracting', 'summarizing', 'completed', 'failed');
CREATE TYPE relationship_type AS ENUM (
  'parent', 'child', 'spouse', 'sibling',
  'grandparent', 'grandchild',
  'uncle_aunt', 'nephew_niece', 'cousin',
  'in_law', 'step_parent', 'step_child', 'step_sibling',
  'adopted_parent', 'adopted_child',
  'godparent', 'godchild',
  'other'
);
CREATE TYPE family_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE media_type AS ENUM ('audio', 'image', 'video', 'document', 'pdf_export');
CREATE TYPE export_status AS ENUM ('queued', 'generating', 'completed', 'failed');

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Denormalized subscription info for fast access
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  interview_count INTEGER NOT NULL DEFAULT 0,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier subscription_tier NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  -- RevenueCat / Store identifiers
  provider TEXT NOT NULL DEFAULT 'revenuecat', -- 'revenuecat', 'apple', 'google', 'stripe'
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  -- Dates
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  -- Store receipt for validation
  receipt_data TEXT,
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_provider ON public.subscriptions(provider, provider_subscription_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status) WHERE status = 'active';

-- ============================================================
-- FAMILY GROUPS
-- ============================================================

CREATE TABLE public.family_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_family_groups_created_by ON public.family_groups(created_by);

-- ============================================================
-- FAMILY GROUP MEMBERS (sharing & permissions)
-- ============================================================

CREATE TABLE public.family_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role family_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES public.profiles(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(family_group_id, user_id)
);

CREATE INDEX idx_fgm_user ON public.family_group_members(user_id);
CREATE INDEX idx_fgm_group ON public.family_group_members(family_group_id);

-- ============================================================
-- PEOPLE (nodes in the genealogical graph)
-- ============================================================

CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  -- Basic info
  first_name TEXT NOT NULL,
  last_name TEXT,
  nickname TEXT,
  -- Dates
  birth_date DATE,
  birth_date_approximate BOOLEAN DEFAULT FALSE,
  death_date DATE,
  death_date_approximate BOOLEAN DEFAULT FALSE,
  -- Location
  birth_place TEXT,
  current_location TEXT,
  -- Media
  avatar_url TEXT,
  -- AI-generated content
  ai_biography TEXT,
  ai_biography_generated_at TIMESTAMPTZ,
  ai_summary TEXT,
  -- Graph positioning (for constellation view)
  graph_x FLOAT,
  graph_y FLOAT,
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_people_family_group ON public.people(family_group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_name ON public.people(family_group_id, first_name, last_name);

-- ============================================================
-- RELATIONSHIPS (edges in the genealogical graph)
-- ============================================================

CREATE TABLE public.relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  -- Directional: person_a has relationship_type to person_b
  -- e.g., person_a is 'parent' of person_b
  person_a_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  person_b_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  relationship_type relationship_type NOT NULL,
  -- Optional metadata
  start_date DATE, -- e.g., marriage date
  end_date DATE,   -- e.g., divorce date
  notes TEXT,
  -- Source tracking
  source_interview_id UUID, -- which interview revealed this
  confidence FLOAT DEFAULT 1.0, -- AI confidence score
  verified BOOLEAN NOT NULL DEFAULT FALSE, -- user confirmed
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate relationships
  UNIQUE(person_a_id, person_b_id, relationship_type)
);

CREATE INDEX idx_relationships_family ON public.relationships(family_group_id);
CREATE INDEX idx_relationships_person_a ON public.relationships(person_a_id);
CREATE INDEX idx_relationships_person_b ON public.relationships(person_b_id);

-- ============================================================
-- INTERVIEWS
-- ============================================================

CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  conducted_by UUID NOT NULL REFERENCES public.profiles(id),
  -- Interview metadata
  title TEXT,
  description TEXT,
  -- Subject (who is being interviewed, if known)
  subject_person_id UUID REFERENCES public.people(id),
  -- Audio
  audio_storage_path TEXT, -- path in Supabase Storage
  audio_duration_seconds INTEGER,
  audio_size_bytes BIGINT,
  -- Processing state
  status interview_status NOT NULL DEFAULT 'recording',
  processing_stage processing_stage,
  processing_error TEXT,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  -- AI processing results
  ai_summary TEXT,
  ai_key_topics TEXT[],
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_interviews_family ON public.interviews(family_group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interviews_user ON public.interviews(conducted_by);
CREATE INDEX idx_interviews_status ON public.interviews(status) WHERE status != 'completed';

-- ============================================================
-- TRANSCRIPTS
-- ============================================================

CREATE TABLE public.transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  -- Full transcript text
  full_text TEXT NOT NULL DEFAULT '',
  -- Word-level timing (for audio sync)
  word_timings JSONB, -- [{word, start_ms, end_ms, confidence}, ...]
  -- Speaker diarization
  speakers JSONB, -- [{id, name, segments: [{start_ms, end_ms}]}]
  -- Processing metadata
  provider TEXT, -- 'whisper', 'deepgram', etc.
  language TEXT DEFAULT 'en',
  confidence FLOAT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_transcripts_interview ON public.transcripts(interview_id);

-- ============================================================
-- EXTRACTED ENTITIES (AI-extracted from transcripts)
-- ============================================================

CREATE TABLE public.extracted_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  transcript_id UUID NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  -- Entity info
  entity_type TEXT NOT NULL, -- 'person', 'date', 'location', 'event', 'relationship'
  entity_value TEXT NOT NULL,
  -- Where in transcript
  transcript_offset_start INTEGER,
  transcript_offset_end INTEGER,
  -- Linking (if resolved to existing records)
  linked_person_id UUID REFERENCES public.people(id),
  -- AI confidence
  confidence FLOAT DEFAULT 0.0,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  -- Full extraction context
  context_text TEXT, -- surrounding text for reference
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_interview ON public.extracted_entities(interview_id);
CREATE INDEX idx_entities_type ON public.extracted_entities(entity_type);
CREATE INDEX idx_entities_person ON public.extracted_entities(linked_person_id) WHERE linked_person_id IS NOT NULL;

-- ============================================================
-- STORIES (narrative content attached to people)
-- ============================================================

CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  -- Source
  interview_id UUID REFERENCES public.interviews(id),
  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  -- Time context
  event_date DATE,
  event_date_approximate BOOLEAN DEFAULT FALSE,
  event_location TEXT,
  -- Audio clip (if extracted from interview)
  audio_clip_start_ms INTEGER,
  audio_clip_end_ms INTEGER,
  audio_clip_storage_path TEXT,
  -- Metadata
  tags TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_stories_family ON public.stories(family_group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_stories_interview ON public.stories(interview_id);

-- Junction table: stories can involve multiple people
CREATE TABLE public.story_people (
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'mentioned', -- 'subject', 'mentioned', 'narrator'
  PRIMARY KEY (story_id, person_id)
);

CREATE INDEX idx_story_people_person ON public.story_people(person_id);

-- ============================================================
-- MEDIA ASSETS
-- ============================================================

CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  -- File info
  storage_path TEXT NOT NULL,
  media_type media_type NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  -- Optional associations
  person_id UUID REFERENCES public.people(id),
  story_id UUID REFERENCES public.stories(id),
  interview_id UUID REFERENCES public.interviews(id),
  -- Metadata
  caption TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_family ON public.media_assets(family_group_id);
CREATE INDEX idx_media_person ON public.media_assets(person_id) WHERE person_id IS NOT NULL;

-- ============================================================
-- EXPORTS (memory books, documentary scripts)
-- ============================================================

CREATE TABLE public.exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  export_type TEXT NOT NULL, -- 'memory_book', 'documentary_script', 'family_data'
  status export_status NOT NULL DEFAULT 'queued',
  -- Output
  output_storage_path TEXT,
  output_size_bytes BIGINT,
  -- Configuration
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Error tracking
  error_message TEXT,
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exports_family ON public.exports(family_group_id);
CREATE INDEX idx_exports_user ON public.exports(requested_by);

-- ============================================================
-- PROCESSING QUEUE (for async AI jobs)
-- ============================================================

CREATE TABLE public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Job type
  job_type TEXT NOT NULL, -- 'transcribe', 'extract', 'summarize', 'biography', 'export'
  -- Reference
  interview_id UUID REFERENCES public.interviews(id),
  person_id UUID REFERENCES public.people(id),
  export_id UUID REFERENCES public.exports(id),
  -- State
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed', 'retrying'
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  -- Error
  last_error TEXT,
  -- Scheduling
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Payload
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  -- Ownership
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON public.processing_jobs(status, run_after) WHERE status IN ('queued', 'retrying');
CREATE INDEX idx_jobs_interview ON public.processing_jobs(interview_id) WHERE interview_id IS NOT NULL;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is member of a family group
CREATE OR REPLACE FUNCTION public.is_family_member(group_id UUID, min_role family_role DEFAULT 'viewer')
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_group_members
    WHERE family_group_id = group_id
      AND user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND (
        CASE min_role
          WHEN 'viewer' THEN role IN ('viewer', 'editor', 'owner')
          WHEN 'editor' THEN role IN ('editor', 'owner')
          WHEN 'owner' THEN role = 'owner'
        END
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Profiles ──
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- ── Subscriptions ──
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- ── Family Groups ──
CREATE POLICY "Members can view family groups"
  ON public.family_groups FOR SELECT
  USING (public.is_family_member(id));

CREATE POLICY "Users can create family groups"
  ON public.family_groups FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can update family groups"
  ON public.family_groups FOR UPDATE
  USING (public.is_family_member(id, 'owner'));

-- ── Family Group Members ──
CREATE POLICY "Members can view group members"
  ON public.family_group_members FOR SELECT
  USING (public.is_family_member(family_group_id));

CREATE POLICY "Owners can manage members"
  ON public.family_group_members FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'owner'));

CREATE POLICY "Owners can update members"
  ON public.family_group_members FOR UPDATE
  USING (public.is_family_member(family_group_id, 'owner'));

CREATE POLICY "Owners can remove members"
  ON public.family_group_members FOR DELETE
  USING (public.is_family_member(family_group_id, 'owner') OR user_id = auth.uid());

-- ── People ──
CREATE POLICY "Members can view people"
  ON public.people FOR SELECT
  USING (public.is_family_member(family_group_id));

CREATE POLICY "Editors can create people"
  ON public.people FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'editor'));

CREATE POLICY "Editors can update people"
  ON public.people FOR UPDATE
  USING (public.is_family_member(family_group_id, 'editor'));

-- ── Relationships ──
CREATE POLICY "Members can view relationships"
  ON public.relationships FOR SELECT
  USING (public.is_family_member(family_group_id));

CREATE POLICY "Editors can create relationships"
  ON public.relationships FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'editor'));

CREATE POLICY "Editors can update relationships"
  ON public.relationships FOR UPDATE
  USING (public.is_family_member(family_group_id, 'editor'));

-- ── Interviews ──
CREATE POLICY "Members can view interviews"
  ON public.interviews FOR SELECT
  USING (public.is_family_member(family_group_id));

CREATE POLICY "Editors can create interviews"
  ON public.interviews FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'editor'));

CREATE POLICY "Editors can update interviews"
  ON public.interviews FOR UPDATE
  USING (public.is_family_member(family_group_id, 'editor'));

-- ── Transcripts ──
CREATE POLICY "Members can view transcripts"
  ON public.transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id
        AND public.is_family_member(i.family_group_id)
    )
  );

-- ── Extracted Entities ──
CREATE POLICY "Members can view entities"
  ON public.extracted_entities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id
        AND public.is_family_member(i.family_group_id)
    )
  );

-- ── Stories ──
CREATE POLICY "Members can view stories"
  ON public.stories FOR SELECT
  USING (public.is_family_member(family_group_id));

CREATE POLICY "Editors can create stories"
  ON public.stories FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'editor'));

CREATE POLICY "Editors can update stories"
  ON public.stories FOR UPDATE
  USING (public.is_family_member(family_group_id, 'editor'));

-- ── Story People ──
CREATE POLICY "Members can view story people"
  ON public.story_people FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id
        AND public.is_family_member(s.family_group_id)
    )
  );

CREATE POLICY "Editors can manage story people"
  ON public.story_people FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id
        AND public.is_family_member(s.family_group_id, 'editor')
    )
  );

-- ── Media Assets ──
CREATE POLICY "Members can view media"
  ON public.media_assets FOR SELECT
  USING (public.is_family_member(family_group_id));

CREATE POLICY "Editors can upload media"
  ON public.media_assets FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'editor'));

-- ── Exports ──
CREATE POLICY "Members can view exports"
  ON public.exports FOR SELECT
  USING (public.is_family_member(family_group_id));

CREATE POLICY "Editors can request exports"
  ON public.exports FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'editor'));

-- ── Processing Jobs ──
CREATE POLICY "Users can view own jobs"
  ON public.processing_jobs FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.family_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.relationships
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transcripts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-add creator as owner when family group is created
CREATE OR REPLACE FUNCTION public.handle_new_family_group()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.family_group_members (family_group_id, user_id, role, invited_by, accepted_at)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_family_group_created
  AFTER INSERT ON public.family_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_family_group();

-- Increment interview count on profile
CREATE OR REPLACE FUNCTION public.handle_interview_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
    SET interview_count = interview_count + 1
    WHERE id = NEW.conducted_by;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET interview_count = GREATEST(interview_count - 1, 0)
    WHERE id = OLD.conducted_by;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_interview_change
  AFTER INSERT OR DELETE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_interview_count();
