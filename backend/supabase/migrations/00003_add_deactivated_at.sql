-- Add deactivated_at to profiles for account deactivation feature
ALTER TABLE public.profiles
  ADD COLUMN deactivated_at TIMESTAMPTZ;
