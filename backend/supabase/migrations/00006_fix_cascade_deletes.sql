-- ============================================================
-- Fix missing ON DELETE CASCADE for FK references to profiles
-- ============================================================
-- people.created_by and interviews.conducted_by lacked CASCADE,
-- causing "Failed to delete auth user" when deleting accounts.
-- ============================================================

-- people.created_by → profiles(id)
ALTER TABLE public.people
  DROP CONSTRAINT people_created_by_fkey,
  ADD CONSTRAINT people_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- interviews.conducted_by → profiles(id)
ALTER TABLE public.interviews
  DROP CONSTRAINT interviews_conducted_by_fkey,
  ADD CONSTRAINT interviews_conducted_by_fkey
    FOREIGN KEY (conducted_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
