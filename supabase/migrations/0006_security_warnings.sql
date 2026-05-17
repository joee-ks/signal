-- ============================================================================
-- Address Supabase security-advisor warnings.
--
-- 1. set_updated_at: pin search_path so a malicious schema earlier in the
--    path cant intercept the now() call. The function only uses pg_catalog
--    builtins which are always first in the resolution order, so empty
--    search_path is safe.
--
-- 2. handle_new_user: REVOKE EXECUTE from anon and authenticated so the
--    SECURITY DEFINER function isnt callable via /rest/v1/rpc/handle_new_user.
--    The function is only meant to be invoked by the on_auth_user_created
--    trigger, which runs as the function owner regardless of EXECUTE grants,
--    so revoking doesnt break the trigger. Also revoke from PUBLIC to remove
--    the implicit grant-to-everyone default that comes with CREATE FUNCTION.
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
