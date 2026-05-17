-- ============================================================================
-- Atomic balance adjustment.
--
-- The app's adjustBalance helper used to read current_balance_cents, add the
-- delta in JS, then write the new value — a classic read-modify-write race.
-- Two concurrent transaction edits on the same account would both read the
-- same starting value and the second write would clobber the first. Limited
-- to a single user's own balance (RLS), but the displayed balance could
-- silently drift from reality.
--
-- This RPC performs the addition in a single SQL statement, so concurrent
-- calls compose correctly. SECURITY INVOKER (the default) means RLS still
-- applies — the function can only update rows the calling user owns.
-- ============================================================================

create or replace function public.adjust_account_balance(
  p_account_id uuid,
  p_delta int
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.accounts
  set current_balance_cents = coalesce(current_balance_cents, 0) + p_delta
  where id = p_account_id;
$$;

grant execute on function public.adjust_account_balance(uuid, int) to authenticated;
