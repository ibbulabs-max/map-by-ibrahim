CREATE TABLE public.houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id text NOT NULL,
  house_number text,
  status text,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  location_status text NOT NULL DEFAULT 'not_mapped',
  mapped_by uuid,
  mapped_at timestamptz,
  location_source text,
  assigned_csw_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  pin_id uuid REFERENCES public.pins(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX houses_house_id_key ON public.houses (upper(house_id));
CREATE INDEX houses_assigned_csw_idx ON public.houses (assigned_csw_id);
CREATE INDEX houses_supervisor_idx ON public.houses (supervisor_id);
CREATE INDEX houses_location_status_idx ON public.houses (location_status);

CREATE TABLE public.house_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_uuid uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  member_id text,
  member_name text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX house_members_house_idx ON public.house_members (house_uuid);
CREATE UNIQUE INDEX house_members_unique_member ON public.house_members (house_uuid, upper(member_id)) WHERE member_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.houses TO authenticated;
GRANT ALL ON public.houses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.house_members TO authenticated;
GRANT ALL ON public.house_members TO service_role;

ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_house(_house uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.houses h
    WHERE h.id = _house
      AND (
        public.is_admin_like(_user)
        OR h.assigned_csw_id = _user
        OR h.supervisor_id = _user
        OR h.created_by = _user
        OR (h.assigned_csw_id IS NOT NULL AND public.is_supervisor_of(_user, h.assigned_csw_id))
      )
  );
$$;

CREATE POLICY houses_select_scoped ON public.houses
  FOR SELECT TO authenticated
  USING (
    public.is_admin_like(auth.uid())
    OR assigned_csw_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR created_by = auth.uid()
    OR (assigned_csw_id IS NOT NULL AND public.is_supervisor_of(auth.uid(), assigned_csw_id))
  );

CREATE POLICY houses_insert_scoped ON public.houses
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY houses_update_scoped ON public.houses
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_like(auth.uid())
    OR assigned_csw_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR created_by = auth.uid()
    OR (assigned_csw_id IS NOT NULL AND public.is_supervisor_of(auth.uid(), assigned_csw_id))
  )
  WITH CHECK (
    public.is_admin_like(auth.uid())
    OR assigned_csw_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR created_by = auth.uid()
    OR (assigned_csw_id IS NOT NULL AND public.is_supervisor_of(auth.uid(), assigned_csw_id))
  );

CREATE POLICY houses_delete_admin ON public.houses
  FOR DELETE TO authenticated
  USING (public.is_admin_like(auth.uid()));

CREATE POLICY house_members_select_scoped ON public.house_members
  FOR SELECT TO authenticated
  USING (public.can_access_house(house_uuid, auth.uid()));

CREATE POLICY house_members_insert_scoped ON public.house_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_house(house_uuid, auth.uid()));

CREATE POLICY house_members_update_scoped ON public.house_members
  FOR UPDATE TO authenticated
  USING (public.can_access_house(house_uuid, auth.uid()))
  WITH CHECK (public.can_access_house(house_uuid, auth.uid()));

CREATE POLICY house_members_delete_scoped ON public.house_members
  FOR DELETE TO authenticated
  USING (public.can_access_house(house_uuid, auth.uid()));

CREATE TRIGGER houses_updated_at BEFORE UPDATE ON public.houses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER house_members_updated_at BEFORE UPDATE ON public.house_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();