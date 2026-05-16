-- ============================================================================
-- Phase 5A bug fix: distinguish sign-up vs sign-in by checking email existence.
-- Run in Supabase SQL Editor.
-- ============================================================================
-- Returns true if an account exists for the given email. Exposed to the anon
-- role so the unauthenticated /login page can call it (via supabase.rpc) and
-- show the right "this email is already registered" / "no account found"
-- guidance instead of silently creating or signing in.
--
-- Note: this allows email-enumeration (you can check if an email is registered
-- without logging in). That's an explicit trade-off for friendlier UX, in line
-- with how most consumer apps behave.
-- ============================================================================

create or replace function public.email_has_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

grant execute on function public.email_has_account(text) to anon, authenticated;
