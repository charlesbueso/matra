-- ============================================================
-- Migration 00014: Improve Relationship Detection
-- ============================================================
-- Adds is_inferred flag to distinguish AI-extracted relationships
-- from those inferred by the transitive engine. Allows safe
-- re-computation of inferred relationships without losing
-- extracted or user-verified data.
-- ============================================================

ALTER TABLE public.relationships
  ADD COLUMN is_inferred BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient cleanup of stale inferred relationships
CREATE INDEX idx_relationships_inferred
  ON public.relationships(family_group_id)
  WHERE is_inferred = true;
