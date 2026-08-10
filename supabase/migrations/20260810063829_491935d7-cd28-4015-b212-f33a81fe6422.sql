ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_files jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.house_members
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by uuid NOT NULL,
  uploaded_by_name text,
  uploaded_role text,
  assigned_to uuid,
  assigned_to_name text,
  supervisor_id uuid,
  total_rows integer NOT NULL DEFAULT 0,
  unique_houses integer NOT NULL DEFAULT 0,
  houses_added integer NOT NULL DEFAULT 0,
  houses_updated integer NOT NULL DEFAULT 0,
  members_added integer NOT NULL DEFAULT 0,
  members_merged integer NOT NULL DEFAULT 0,
  merged_records integer NOT NULL DEFAULT 0,
  conflicts integer NOT NULL DEFAULT 0,
  unmapped_houses integer NOT NULL DEFAULT 0,
  new_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_insert_self" ON public.import_batches
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "import_batches_select_scoped" ON public.import_batches
  FOR SELECT TO authenticated USING (
    uploaded_by = auth.uid()
    OR assigned_to = auth.uid()
    OR supervisor_id = auth.uid()
    OR public.is_admin_like(auth.uid())
    OR public.is_supervisor_of(auth.uid(), uploaded_by)
    OR (assigned_to IS NOT NULL AND public.is_supervisor_of(auth.uid(), assigned_to))
  );

CREATE POLICY "import_batches_update_scoped" ON public.import_batches
  FOR UPDATE TO authenticated USING (
    uploaded_by = auth.uid() OR public.is_admin_like(auth.uid())
  ) WITH CHECK (
    uploaded_by = auth.uid() OR public.is_admin_like(auth.uid())
  );

CREATE TRIGGER import_batches_updated_at BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.import_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  house_uuid uuid REFERENCES public.houses(id) ON DELETE CASCADE,
  house_id text NOT NULL,
  entity text NOT NULL DEFAULT 'house',
  member_ref text,
  field text NOT NULL,
  existing_value text,
  new_value text,
  source_file text,
  status text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_conflicts_status_idx ON public.import_conflicts (status);
CREATE INDEX IF NOT EXISTS import_conflicts_house_idx ON public.import_conflicts (house_uuid);

GRANT SELECT, INSERT, UPDATE ON public.import_conflicts TO authenticated;
GRANT ALL ON public.import_conflicts TO service_role;
ALTER TABLE public.import_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_conflicts_insert_scoped" ON public.import_conflicts
  FOR INSERT TO authenticated WITH CHECK (
    house_uuid IS NULL OR public.can_access_house(house_uuid, auth.uid())
  );

CREATE POLICY "import_conflicts_select_scoped" ON public.import_conflicts
  FOR SELECT TO authenticated USING (
    house_uuid IS NULL OR public.can_access_house(house_uuid, auth.uid())
  );

CREATE POLICY "import_conflicts_update_scoped" ON public.import_conflicts
  FOR UPDATE TO authenticated USING (
    house_uuid IS NULL OR public.can_access_house(house_uuid, auth.uid())
  ) WITH CHECK (
    house_uuid IS NULL OR public.can_access_house(house_uuid, auth.uid())
  );

CREATE TRIGGER import_conflicts_updated_at BEFORE UPDATE ON public.import_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();