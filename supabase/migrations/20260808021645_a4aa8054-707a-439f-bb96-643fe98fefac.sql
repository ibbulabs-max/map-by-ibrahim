REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_like(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_supervisor_of(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_like(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of(uuid, uuid) TO authenticated, service_role;