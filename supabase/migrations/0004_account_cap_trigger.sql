-- ============================================================================
-- Account-cap enforcement at the database layer.
--
-- The app already pre-checks the 12-account cap in the createAccount server
-- action, but that's a check-then-act pattern — parallel requests from the
-- same user can both observe count < 12 and both insert, exceeding the cap.
-- This trigger closes the race by taking a per-user advisory lock before
-- counting, then raising if the count is at or above the cap. The advisory
-- lock serializes concurrent inserts for the same user; readers and inserts
-- for other users are unaffected.
--
-- Match the constant in lib/profile.ts (MAX_ACCOUNTS_PER_USER = 12). If you
-- change one, change both — there's no shared source of truth across the
-- code/db boundary.
-- ============================================================================

create or replace function public.enforce_account_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  active_count int;
begin
  -- Serialize this user's account inserts. xact-scoped, releases on commit.
  perform pg_advisory_xact_lock(
    hashtext('signal.account_cap.' || new.user_id::text)
  );
  select count(*) into active_count
  from public.accounts
  where user_id = new.user_id and is_archived = false;
  if active_count >= 12 then
    -- P0001 is the generic plpgsql raise_exception code; the app catches
    -- the message string to surface a friendly banner.
    raise exception 'account_cap_exceeded'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_enforce_cap on public.accounts;
create trigger accounts_enforce_cap
  before insert on public.accounts
  for each row execute function public.enforce_account_cap();
