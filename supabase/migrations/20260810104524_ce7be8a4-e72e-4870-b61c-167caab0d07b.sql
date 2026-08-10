ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS surveyor text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_key text,
  ADD COLUMN IF NOT EXISTS external_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS house_uuid uuid REFERENCES public.houses(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pins_import_key_uidx ON public.pins (import_key) WHERE import_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pins_house_uuid_idx ON public.pins (house_uuid);
CREATE INDEX IF NOT EXISTS pins_house_id_idx ON public.pins (upper(house_id));