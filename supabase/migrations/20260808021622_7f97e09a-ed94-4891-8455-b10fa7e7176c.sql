-- Helper: admin or super admin
CREATE OR REPLACE FUNCTION public.is_admin_like(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;

-- Helper: is _supervisor_id the active supervisor of _csw_id
CREATE OR REPLACE FUNCTION public.is_supervisor_of(_supervisor_id uuid, _csw_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE supervisor_id = _supervisor_id AND csw_id = _csw_id AND status = 'active'
  );
$$;

-- PINS
DROP POLICY IF EXISTS pins_select_authenticated ON public.pins;
DROP POLICY IF EXISTS pins_update_own_or_admin ON public.pins;
DROP POLICY IF EXISTS pins_delete_own_or_admin ON public.pins;

CREATE POLICY pins_select_scoped ON public.pins FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin_like(auth.uid())
  OR public.is_supervisor_of(auth.uid(), user_id)
);

CREATE POLICY pins_update_own_or_admin ON public.pins FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_admin_like(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin_like(auth.uid()));

CREATE POLICY pins_delete_own_or_admin ON public.pins FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_admin_like(auth.uid()));

-- PROFILES
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;

CREATE POLICY profiles_select_scoped ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.is_admin_like(auth.uid())
  OR public.is_supervisor_of(auth.uid(), id)
);

CREATE POLICY profiles_update_own_or_admin ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_admin_like(auth.uid()))
WITH CHECK (id = auth.uid() OR public.is_admin_like(auth.uid()));

-- USER ROLES
DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_scoped ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin_like(auth.uid())
  OR public.is_supervisor_of(auth.uid(), user_id)
);

-- ACTIVITY LOGS
DROP POLICY IF EXISTS activity_select_admin ON public.activity_logs;
CREATE POLICY activity_select_scoped ON public.activity_logs FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin_like(auth.uid())
  OR public.is_supervisor_of(auth.uid(), user_id)
);