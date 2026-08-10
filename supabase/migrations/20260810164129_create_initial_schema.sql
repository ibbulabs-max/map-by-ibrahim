/*
# Create initial database schema for survey mapping app

## Overview
This migration creates the complete schema for a multi-user survey mapping application.
The app uses Supabase email/password auth with username-based login (emails are
`<username>@survey.local`). All authenticated users share pin and house data.

## New Tables

1. **profiles** — user profile records (one per auth.users entry)
2. **user_roles** — role assignment (one row per user)
3. **team_memberships** — supervisor → CSW links
4. **pins** — map markers created by survey users
5. **houses** — canonical house records (one per house_id)
6. **house_members** — people living in a house
7. **import_batches** — Excel/CSV import history
8. **import_conflicts** — field-level conflicts from imports
9. **activity_logs** — audit trail
10. **login_attempts** — rate-limiting for username login

## Enums
- `app_role`: 'admin', 'super_admin', 'supervisor', 'survey_user'

## Functions (SQL)
- `has_role(_role, _user_id)` — checks if user has a given role
- `is_admin_like(_user_id)` — true for admin or super_admin
- `is_supervisor_of(_csw_id, _supervisor_id)` — checks active team membership
- `can_access_house(_house, _user)` — access check for a house

## Security (RLS)
All tables have RLS enabled. This is a shared-data multi-user app:
- All authenticated users can SELECT all shared data.
- Pins, houses, house_members: authenticated users can INSERT/UPDATE/DELETE.
- Activity logs: authenticated users can INSERT.
- Import batches/conflicts: authenticated users can INSERT; conflicts can be UPDATEd.
- Profiles, user_roles, team_memberships, login_attempts: SELECT only for authenticated — mutations go through server-side admin client.
*/

-- ──────────────────────────────────────────────────────────────
-- Enum
-- ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'super_admin', 'supervisor', 'survey_user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────────
-- profiles
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    text UNIQUE NOT NULL,
  full_name   text,
  phone       text,
  email       text,
  avatar_url  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles FOR SELECT
  TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────
-- user_roles
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role      app_role NOT NULL,
  UNIQUE (user_id)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_select_authenticated" ON user_roles;
CREATE POLICY "user_roles_select_authenticated" ON user_roles FOR SELECT
  TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────
-- team_memberships
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  csw_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (csw_id)
);

ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_memberships_select_authenticated" ON team_memberships;
CREATE POLICY "team_memberships_select_authenticated" ON team_memberships FOR SELECT
  TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────
-- houses (created before pins due to circular FK)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS houses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id        text NOT NULL,
  house_number    text,
  status          text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_files    jsonb NOT NULL DEFAULT '[]'::jsonb,
  latitude        numeric,
  longitude       numeric,
  accuracy        numeric,
  location_status text NOT NULL DEFAULT 'not_mapped',
  location_source text,
  mapped_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  mapped_at       timestamptz,
  assigned_csw_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  supervisor_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  pin_id          uuid,  -- FK added later via ALTER TABLE (circular dep with pins)
  pin_type        text NOT NULL DEFAULT 'house',
  custom_type     text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE houses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "houses_select_authenticated" ON houses;
CREATE POLICY "houses_select_authenticated" ON houses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "houses_insert_authenticated" ON houses;
CREATE POLICY "houses_insert_authenticated" ON houses FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "houses_update_authenticated" ON houses;
CREATE POLICY "houses_update_authenticated" ON houses FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "houses_delete_authenticated" ON houses;
CREATE POLICY "houses_delete_authenticated" ON houses FOR DELETE
  TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────
-- pins
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pins (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username            text NOT NULL,
  latitude            numeric NOT NULL,
  longitude           numeric NOT NULL,
  accuracy            numeric,
  pin_type            text NOT NULL,
  custom_type         text,
  house_id            text,
  house_number        text,
  owner_name          text,
  notes               text,
  device_time         timestamptz,
  device_id           text,
  surveyor            text,
  source              text NOT NULL DEFAULT 'app',
  import_key          text,
  external_created_at timestamptz,
  house_uuid          uuid REFERENCES houses(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pins_select_authenticated" ON pins;
CREATE POLICY "pins_select_authenticated" ON pins FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "pins_insert_authenticated" ON pins;
CREATE POLICY "pins_insert_authenticated" ON pins FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "pins_update_authenticated" ON pins;
CREATE POLICY "pins_update_authenticated" ON pins FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pins_delete_authenticated" ON pins;
CREATE POLICY "pins_delete_authenticated" ON pins FOR DELETE
  TO authenticated USING (true);

-- Add the circular FK: houses.pin_id → pins.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'houses_pin_id_fkey' AND table_name = 'houses'
  ) THEN
    ALTER TABLE houses
      ADD CONSTRAINT houses_pin_id_fkey
      FOREIGN KEY (pin_id) REFERENCES pins(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- house_members
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS house_members (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_uuid         uuid NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  member_id          text,
  member_name        text,
  data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_files       jsonb NOT NULL DEFAULT '[]'::jsonb,
  possible_duplicate boolean NOT NULL DEFAULT false,
  uploaded_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE house_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "house_members_select_authenticated" ON house_members;
CREATE POLICY "house_members_select_authenticated" ON house_members FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "house_members_insert_authenticated" ON house_members;
CREATE POLICY "house_members_insert_authenticated" ON house_members FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "house_members_update_authenticated" ON house_members;
CREATE POLICY "house_members_update_authenticated" ON house_members FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "house_members_delete_authenticated" ON house_members;
CREATE POLICY "house_members_delete_authenticated" ON house_members FOR DELETE
  TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────
-- import_batches
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  uploaded_by_name  text,
  uploaded_role     text,
  file_names        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'completed',
  total_rows        int NOT NULL DEFAULT 0,
  unique_houses     int NOT NULL DEFAULT 0,
  houses_added      int NOT NULL DEFAULT 0,
  houses_updated    int NOT NULL DEFAULT 0,
  members_added     int NOT NULL DEFAULT 0,
  members_merged    int NOT NULL DEFAULT 0,
  merged_records    int NOT NULL DEFAULT 0,
  conflicts         int NOT NULL DEFAULT 0,
  unmapped_houses   int NOT NULL DEFAULT 0,
  assigned_to       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to_name  text,
  supervisor_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  new_fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_batches_select_authenticated" ON import_batches;
CREATE POLICY "import_batches_select_authenticated" ON import_batches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "import_batches_insert_authenticated" ON import_batches;
CREATE POLICY "import_batches_insert_authenticated" ON import_batches FOR INSERT
  TO authenticated WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- import_conflicts
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_conflicts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       uuid REFERENCES import_batches(id) ON DELETE CASCADE,
  house_id       text NOT NULL,
  house_uuid     uuid REFERENCES houses(id) ON DELETE SET NULL,
  entity         text NOT NULL DEFAULT 'house',
  field          text NOT NULL,
  existing_value text,
  new_value      text,
  member_ref     text,
  source_file    text,
  status         text NOT NULL DEFAULT 'pending',
  resolved_at    timestamptz,
  resolved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE import_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_conflicts_select_authenticated" ON import_conflicts;
CREATE POLICY "import_conflicts_select_authenticated" ON import_conflicts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "import_conflicts_insert_authenticated" ON import_conflicts;
CREATE POLICY "import_conflicts_insert_authenticated" ON import_conflicts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "import_conflicts_update_authenticated" ON import_conflicts;
CREATE POLICY "import_conflicts_update_authenticated" ON import_conflicts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- activity_logs
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  username   text,
  action     text NOT NULL,
  details    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_authenticated" ON activity_logs;
CREATE POLICY "activity_logs_select_authenticated" ON activity_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "activity_logs_insert_authenticated" ON activity_logs;
CREATE POLICY "activity_logs_insert_authenticated" ON activity_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- login_attempts
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_attempts (
  username     text PRIMARY KEY,
  fail_count   int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- No client-side policies: login_attempts is managed exclusively
-- through the server-side admin client (service role bypasses RLS).

-- ──────────────────────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pins_user_id        ON pins(user_id);
CREATE INDEX IF NOT EXISTS idx_pins_created_at     ON pins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pins_house_uuid     ON pins(house_uuid);
CREATE INDEX IF NOT EXISTS idx_houses_house_id     ON houses(house_id);
CREATE INDEX IF NOT EXISTS idx_houses_location     ON houses(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_house_members_house  ON house_members(house_uuid);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user  ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_conflicts_batch ON import_conflicts(batch_id);

-- ──────────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER for role checks)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION has_role(_role app_role, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION is_admin_like(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_supervisor_of(_csw_id uuid, _supervisor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE csw_id = _csw_id
      AND supervisor_id = _supervisor_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION can_access_house(_house uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_admin_like(_user)
  OR (
    _user IN (
      SELECT h.assigned_csw_id FROM houses h
      WHERE h.id = _house
        AND h.assigned_csw_id IS NOT NULL
        AND is_supervisor_of(h.assigned_csw_id, _user)
    )
  )
  OR (
    EXISTS (
      SELECT 1 FROM houses h
      WHERE h.id = _house AND h.assigned_csw_id = _user
    )
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- updated_at trigger
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at       ON profiles;
CREATE TRIGGER trg_profiles_updated_at       BEFORE UPDATE ON profiles       FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pins_updated_at          ON pins;
CREATE TRIGGER trg_pins_updated_at          BEFORE UPDATE ON pins          FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_houses_updated_at        ON houses;
CREATE TRIGGER trg_houses_updated_at        BEFORE UPDATE ON houses        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_house_members_updated_at ON house_members;
CREATE TRIGGER trg_house_members_updated_at BEFORE UPDATE ON house_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_team_memberships_updated_at ON team_memberships;
CREATE TRIGGER trg_team_memberships_updated_at BEFORE UPDATE ON team_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_import_batches_updated_at ON import_batches;
CREATE TRIGGER trg_import_batches_updated_at BEFORE UPDATE ON import_batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_import_conflicts_updated_at ON import_conflicts;
CREATE TRIGGER trg_import_conflicts_updated_at BEFORE UPDATE ON import_conflicts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
