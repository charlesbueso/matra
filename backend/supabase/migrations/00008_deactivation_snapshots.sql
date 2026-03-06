-- ============================================================
-- MATRA — Deactivation Snapshots
-- ============================================================
-- Stores a compressed JSON snapshot of all user data before
-- account deactivation, ensuring data can always be restored
-- even if soft-deleted rows are cleaned up.
-- ============================================================

CREATE TABLE public.deactivation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  deactivated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- RLS: only service role accesses this table (via edge functions)
ALTER TABLE public.deactivation_snapshots ENABLE ROW LEVEL SECURITY;

-- No user-facing RLS policies — only service role client is used
