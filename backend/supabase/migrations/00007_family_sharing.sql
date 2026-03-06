-- ============================================================
-- MATRA — Family Sharing (Invitations & Tree Merging)
-- ============================================================
-- Adds the family_invitations table for premium users to invite
-- family members to join their family group.
-- Invited users (even free-tier) can view & edit the shared tree.
-- ============================================================

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

CREATE TABLE public.family_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Short alphanumeric code for the invite link (e.g. matra://invite/ABC123)
  invite_code TEXT NOT NULL UNIQUE,
  -- How the invitee relates to the inviter: "This person is my ___"
  relationship_type relationship_type NOT NULL,
  -- Optional: link to the person node in the inviter's tree that represents the invitee
  invitee_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  -- Status
  status invitation_status NOT NULL DEFAULT 'pending',
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  -- Expiry (default 7 days)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_code ON public.family_invitations(invite_code) WHERE status = 'pending';
CREATE INDEX idx_invitations_group ON public.family_invitations(family_group_id);
CREATE INDEX idx_invitations_inviter ON public.family_invitations(invited_by);

-- Auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.family_invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- Inviters can view their own invitations
CREATE POLICY "Inviters can view own invitations"
  ON public.family_invitations FOR SELECT
  USING (invited_by = auth.uid() OR accepted_by = auth.uid());

-- Group owners/editors can create invitations
CREATE POLICY "Group editors can create invitations"
  ON public.family_invitations FOR INSERT
  WITH CHECK (public.is_family_member(family_group_id, 'editor'));

-- Inviters can update (revoke) their own invitations
CREATE POLICY "Inviters can update own invitations"
  ON public.family_invitations FOR UPDATE
  USING (invited_by = auth.uid());

-- Anyone can view pending invitations by code (for accepting)
-- This is enforced at the edge function level for security
