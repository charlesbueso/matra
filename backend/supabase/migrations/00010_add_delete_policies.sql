-- ============================================================
-- Migration 00010: Add DELETE RLS policies
--
-- The relationships table had no DELETE policy, causing
-- deleteInterview to silently fail when hard-deleting
-- relationships. This left orphaned people and relationships
-- after interview deletion.
--
-- Also adds DELETE policies to people, stories, and interviews
-- for consistency (currently only soft-deleted via UPDATE,
-- but the policy should exist for safety).
-- ============================================================

-- Relationships: editors can delete
CREATE POLICY "Editors can delete relationships"
  ON public.relationships
  FOR DELETE
  USING (is_family_member(family_group_id, 'editor'));

-- People: editors can delete
CREATE POLICY "Editors can delete people"
  ON public.people
  FOR DELETE
  USING (is_family_member(family_group_id, 'editor'));

-- Stories: editors can delete
CREATE POLICY "Editors can delete stories"
  ON public.stories
  FOR DELETE
  USING (is_family_member(family_group_id, 'editor'));

-- Interviews: editors can delete
CREATE POLICY "Editors can delete interviews"
  ON public.interviews
  FOR DELETE
  USING (is_family_member(family_group_id, 'editor'));
