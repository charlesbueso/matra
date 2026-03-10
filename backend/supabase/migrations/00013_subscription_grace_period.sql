-- ============================================================
-- Migration 00013: Subscription Grace Period Support
-- ============================================================
-- Adds columns to support graceful downgrade when premium expires:
--   grace_period_ends_at: full premium access continues until this date
--   export_access_until:  export stays available for 30 days after expiration
-- ============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN export_access_until TIMESTAMPTZ;

-- Partial index for grace period lookups
CREATE INDEX idx_subscriptions_grace_period
  ON public.subscriptions(user_id, grace_period_ends_at)
  WHERE status = 'grace_period';

-- Also index billing_retry so we can treat it as "still active"
CREATE INDEX idx_subscriptions_billing_retry
  ON public.subscriptions(user_id)
  WHERE status = 'billing_retry';
