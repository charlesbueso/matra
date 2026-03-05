-- Add self_person_id to profiles so users can identify their own person node
ALTER TABLE public.profiles
  ADD COLUMN self_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL;
