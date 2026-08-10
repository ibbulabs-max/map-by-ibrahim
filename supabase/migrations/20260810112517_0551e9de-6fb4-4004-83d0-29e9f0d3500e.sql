ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS pin_type text NOT NULL DEFAULT 'house',
  ADD COLUMN IF NOT EXISTS custom_type text;

-- Backfill from the existing canonical pin where one is already linked.
UPDATE public.houses h
SET pin_type = p.pin_type,
    custom_type = p.custom_type
FROM public.pins p
WHERE p.house_uuid = h.id
  AND h.pin_type = 'house'
  AND p.pin_type IS NOT NULL;

UPDATE public.houses h
SET pin_type = p.pin_type,
    custom_type = p.custom_type
FROM public.pins p
WHERE upper(btrim(p.house_id)) = upper(btrim(h.house_id))
  AND h.pin_type = 'house'
  AND p.pin_type IS NOT NULL
  AND p.pin_type <> 'house';

CREATE INDEX IF NOT EXISTS houses_pin_type_idx ON public.houses (pin_type);