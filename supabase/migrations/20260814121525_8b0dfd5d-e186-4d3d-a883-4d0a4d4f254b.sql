ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS monthly_income numeric,
  ADD COLUMN IF NOT EXISTS earning_members integer,
  ADD COLUMN IF NOT EXISTS total_members integer;

CREATE TABLE public.member_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_uuid uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  member_uuid uuid NOT NULL REFERENCES public.house_members(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  known_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  medication jsonb NOT NULL DEFAULT '{}'::jsonb,
  medical_details text,
  alcohol text,
  alcohol_frequency text,
  smoking text,
  smoking_frequency text,
  tobacco text,
  tobacco_frequency text,
  waist text,
  physical_activity text,
  height_cm numeric,
  weight_kg numeric,
  bmi numeric,
  bmi_category text,
  systolic integer,
  diastolic integer,
  bp_symptoms jsonb NOT NULL DEFAULT '[]'::jsonb,
  blood_sugar numeric,
  sugar_symptoms jsonb NOT NULL DEFAULT '[]'::jsonb,
  referral_needed boolean NOT NULL DEFAULT false,
  referral jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  risk_level text NOT NULL DEFAULT 'unknown',
  risk_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessed_by uuid,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_uuid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_assessments TO authenticated;
GRANT ALL ON public.member_assessments TO service_role;
ALTER TABLE public.member_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY member_assessments_select_scoped ON public.member_assessments
  FOR SELECT TO authenticated USING (public.can_access_house(house_uuid, auth.uid()));
CREATE POLICY member_assessments_insert_scoped ON public.member_assessments
  FOR INSERT TO authenticated WITH CHECK (public.can_access_house(house_uuid, auth.uid()));
CREATE POLICY member_assessments_update_scoped ON public.member_assessments
  FOR UPDATE TO authenticated USING (public.can_access_house(house_uuid, auth.uid()))
  WITH CHECK (public.can_access_house(house_uuid, auth.uid()));
CREATE POLICY member_assessments_delete_scoped ON public.member_assessments
  FOR DELETE TO authenticated USING (public.can_access_house(house_uuid, auth.uid()));

CREATE TRIGGER member_assessments_updated_at BEFORE UPDATE ON public.member_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX member_assessments_house_idx ON public.member_assessments(house_uuid);

CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_uuid uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  member_uuid uuid REFERENCES public.house_members(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  risk_level text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY follow_ups_select_scoped ON public.follow_ups
  FOR SELECT TO authenticated USING (public.can_access_house(house_uuid, auth.uid()));
CREATE POLICY follow_ups_insert_scoped ON public.follow_ups
  FOR INSERT TO authenticated WITH CHECK (public.can_access_house(house_uuid, auth.uid()));
CREATE POLICY follow_ups_update_scoped ON public.follow_ups
  FOR UPDATE TO authenticated USING (public.can_access_house(house_uuid, auth.uid()))
  WITH CHECK (public.can_access_house(house_uuid, auth.uid()));
CREATE POLICY follow_ups_delete_scoped ON public.follow_ups
  FOR DELETE TO authenticated USING (public.can_access_house(house_uuid, auth.uid()));

CREATE TRIGGER follow_ups_updated_at BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX follow_ups_house_idx ON public.follow_ups(house_uuid);