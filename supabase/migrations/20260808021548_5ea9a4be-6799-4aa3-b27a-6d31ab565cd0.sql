-- New role levels
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

-- Team relationship: one supervisor -> many CSWs
CREATE TABLE IF NOT EXISTS public.team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  csw_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_memberships_unique_csw UNIQUE (csw_id),
  CONSTRAINT team_memberships_no_self CHECK (supervisor_id <> csw_id)
);

CREATE INDEX IF NOT EXISTS team_memberships_supervisor_idx ON public.team_memberships (supervisor_id);
CREATE INDEX IF NOT EXISTS team_memberships_csw_idx ON public.team_memberships (csw_id);

GRANT SELECT ON public.team_memberships TO authenticated;
GRANT ALL ON public.team_memberships TO service_role;

ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_memberships_select_related
  ON public.team_memberships FOR SELECT TO authenticated
  USING (
    supervisor_id = auth.uid()
    OR csw_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER team_memberships_updated_at
  BEFORE UPDATE ON public.team_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS pins_user_id_idx ON public.pins (user_id);
CREATE INDEX IF NOT EXISTS pins_created_at_idx ON public.pins (created_at DESC);