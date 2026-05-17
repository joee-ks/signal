-- ============================================================================
-- Widen adjust_account_balance(p_delta) from int to bigint.
--
-- amount_cents is bigint throughout the schema and the rest of the app,
-- but the RPC's p_delta parameter was int (32-bit, max ~$21M). A delta
-- beyond that would overflow on the wire before reaching the SQL +.
-- Not exploitable in personal-finance scope but the column-type mismatch
-- was a future-bug waiting to surprise someone.
--
-- Postgres can't CREATE OR REPLACE a function with a changed signature,
-- so we drop and recreate. The grant has to be re-issued.
-- ============================================================================

drop function if exists public.adjust_account_balance(uuid, int);

create or replace function public.adjust_account_balance(
  p_account_id uuid,
  p_delta bigint
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

grant execute on function public.adjust_account_balance(uuid, bigint) to authenticated;
