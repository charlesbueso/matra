-- ============================================================
-- Track user-rejected relationships so AI inference won't recreate them
-- ============================================================

CREATE TABLE public.rejected_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  person_a_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  person_b_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  relationship_type relationship_type NOT NULL,
  rejected_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate rejections
  UNIQUE(family_group_id, person_a_id, person_b_id, relationship_type)
);

CREATE INDEX idx_rejected_relationships_family ON public.rejected_relationships(family_group_id);

-- RLS: users can manage rejected relationships in their family groups
ALTER TABLE public.rejected_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rejected relationships in their family group"
  ON public.rejected_relationships FOR SELECT
  USING (
    family_group_id IN (
      SELECT family_group_id FROM public.family_group_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert rejected relationships in their family group"
  ON public.rejected_relationships FOR INSERT
  WITH CHECK (
    family_group_id IN (
      SELECT family_group_id FROM public.family_group_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete rejected relationships in their family group"
  ON public.rejected_relationships FOR DELETE
  USING (
    family_group_id IN (
      SELECT family_group_id FROM public.family_group_members
      WHERE user_id = auth.uid()
    )
  );
