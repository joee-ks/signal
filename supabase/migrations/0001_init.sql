-- ============================================================================
-- Signal — initial schema (Phase 1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (idempotent-ish via "if not exists" / guards).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text,
  -- rough monthly take-home pay, in minor units (cents). Powers ratios + forecasts.
  monthly_income_cents  bigint,
  currency              text not null default 'USD',
  onboarded_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type public.account_type as enum ('checking', 'savings', 'credit', 'cash', 'other');
  end if;
end $$;

create table if not exists public.accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  name                   text not null,
  type                   public.account_type not null default 'checking',
  -- current balance in minor units (cents). For credit accounts this is the
  -- (typically negative) balance owed.
  current_balance_cents  bigint not null default 0,
  currency               text not null default 'USD',
  is_archived            boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists accounts_user_id_idx on public.accounts(user_id);

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions
-- amount_cents: signed minor units — negative = money out, positive = money in
-- bucket: high-level classification used by the intelligence engine
--   'income' | 'essential' | 'discretionary' | 'transfer' | 'debt'
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  amount_cents  bigint not null,
  occurred_on   date not null,
  description   text not null default '',
  merchant      text,
  category      text not null default 'uncategorized',
  bucket        text not null default 'discretionary',
  is_recurring  boolean not null default false,
  source        text not null default 'manual',  -- 'manual' | 'csv'
  external_id   text,                              -- reserved for future imports/Plaid dedupe
  created_at    timestamptz not null default now()
);
create index if not exists transactions_user_id_idx     on public.transactions(user_id);
create index if not exists transactions_user_date_idx    on public.transactions(user_id, occurred_on desc);
create index if not exists transactions_account_idx      on public.transactions(account_id);

-- ---------------------------------------------------------------------------
-- category_rules
-- user_id NULL = built-in global default rule (readable by everyone).
-- `match` is matched case-insensitively as a substring of description/merchant.
-- ---------------------------------------------------------------------------
create table if not exists public.category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  match       text not null,
  category    text not null,
  bucket      text not null default 'discretionary',
  priority    int  not null default 100,  -- lower = checked first
  created_at  timestamptz not null default now()
);
create index if not exists category_rules_user_idx on public.category_rules(user_id);

-- ---------------------------------------------------------------------------
-- signals_snapshots
-- One cached "intelligence" computation per user per period.
-- period: 'YYYY-MM' for a month-end snapshot, or 'live' for the rolling current view.
-- ---------------------------------------------------------------------------
create table if not exists public.signals_snapshots (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  period           text not null,
  health_score     int,                                  -- 0..100
  sub_scores       jsonb not null default '{}'::jsonb,
  patterns         jsonb not null default '[]'::jsonb,
  forecast         jsonb not null default '{}'::jsonb,
  metrics          jsonb not null default '{}'::jsonb,    -- raw computed numbers (audit)
  narrative        text,
  narrative_model  text,
  generated_at     timestamptz not null default now()
);
create unique index if not exists signals_snapshots_user_period_idx
  on public.signals_snapshots(user_id, period);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.accounts          enable row level security;
alter table public.transactions      enable row level security;
alter table public.category_rules    enable row level security;
alter table public.signals_snapshots enable row level security;

-- profiles
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- accounts
drop policy if exists "accounts_owner_all" on public.accounts;
create policy "accounts_owner_all" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- transactions
drop policy if exists "transactions_owner_all" on public.transactions;
create policy "transactions_owner_all" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- category_rules: read global (user_id is null) OR your own; write only your own
drop policy if exists "category_rules_select" on public.category_rules;
create policy "category_rules_select" on public.category_rules
  for select using (user_id is null or auth.uid() = user_id);

drop policy if exists "category_rules_insert_own" on public.category_rules;
create policy "category_rules_insert_own" on public.category_rules
  for insert with check (auth.uid() = user_id);

drop policy if exists "category_rules_update_own" on public.category_rules;
create policy "category_rules_update_own" on public.category_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "category_rules_delete_own" on public.category_rules;
create policy "category_rules_delete_own" on public.category_rules
  for delete using (auth.uid() = user_id);

-- signals_snapshots
drop policy if exists "signals_owner_all" on public.signals_snapshots;
create policy "signals_owner_all" on public.signals_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed: built-in global category rules (only if none exist yet)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.category_rules where user_id is null) then
    insert into public.category_rules (user_id, match, category, bucket, priority) values
      (null, 'payroll',                'income',        'income',        10),
      (null, 'salary',                 'income',        'income',        10),
      (null, 'direct deposit',         'income',        'income',        10),
      (null, 'paycheck',               'income',        'income',        10),
      (null, 'interest payment',       'income',        'income',        20),
      (null, 'refund',                 'income',        'income',        20),
      (null, 'rent',                   'housing',       'essential',     30),
      (null, 'mortgage',               'housing',       'essential',     30),
      (null, 'landlord',               'housing',       'essential',     30),
      (null, 'property mgmt',          'housing',       'essential',     30),
      (null, 'electric',               'utilities',     'essential',     32),
      (null, 'water bill',             'utilities',     'essential',     32),
      (null, 'gas bill',               'utilities',     'essential',     32),
      (null, 'pg&e',                   'utilities',     'essential',     32),
      (null, 'con edison',             'utilities',     'essential',     32),
      (null, 'internet',               'utilities',     'essential',     32),
      (null, 'comcast',                'utilities',     'essential',     32),
      (null, 'xfinity',                'utilities',     'essential',     32),
      (null, 'spectrum',               'utilities',     'essential',     32),
      (null, 'verizon',                'phone',         'essential',     32),
      (null, 't-mobile',               'phone',         'essential',     32),
      (null, 'at&t',                   'phone',         'essential',     32),
      (null, 'mint mobile',            'phone',         'essential',     32),
      (null, 'insurance',              'insurance',     'essential',     34),
      (null, 'geico',                  'insurance',     'essential',     34),
      (null, 'state farm',             'insurance',     'essential',     34),
      (null, 'progressive',            'insurance',     'essential',     34),
      (null, 'allstate',               'insurance',     'essential',     34),
      (null, 'student loan',           'debt',          'debt',          35),
      (null, 'sallie mae',             'debt',          'debt',          35),
      (null, 'nelnet',                 'debt',          'debt',          35),
      (null, 'mohela',                 'debt',          'debt',          35),
      (null, 'loan payment',           'debt',          'debt',          35),
      (null, 'credit card payment',    'debt',          'debt',          35),
      (null, 'card payment',           'debt',          'debt',          36),
      (null, 'affirm',                 'debt',          'debt',          36),
      (null, 'klarna',                 'debt',          'debt',          36),
      (null, 'afterpay',               'debt',          'debt',          36),
      (null, 'kroger',                 'groceries',     'essential',     40),
      (null, 'safeway',                'groceries',     'essential',     40),
      (null, 'trader joe',             'groceries',     'essential',     40),
      (null, 'whole foods',            'groceries',     'essential',     40),
      (null, 'aldi',                   'groceries',     'essential',     40),
      (null, 'publix',                 'groceries',     'essential',     40),
      (null, 'wegmans',                'groceries',     'essential',     40),
      (null, 'walmart',                'groceries',     'essential',     42),
      (null, 'costco',                 'groceries',     'essential',     42),
      (null, 'sam''s club',            'groceries',     'essential',     42),
      (null, 'cvs',                    'health',        'essential',     40),
      (null, 'walgreens',              'health',        'essential',     40),
      (null, 'pharmacy',               'health',        'essential',     40),
      (null, 'rite aid',               'health',        'essential',     40),
      (null, 'shell',                  'transport',     'essential',     42),
      (null, 'chevron',                'transport',     'essential',     42),
      (null, 'exxon',                  'transport',     'essential',     42),
      (null, 'mobil',                  'transport',     'essential',     42),
      (null, 'bp ',                    'transport',     'essential',     42),
      (null, 'gas station',            'transport',     'essential',     42),
      (null, 'parking',                'transport',     'essential',     44),
      (null, 'mta',                    'transport',     'essential',     44),
      (null, 'transit',                'transport',     'essential',     44),
      (null, 'netflix',                'subscriptions', 'discretionary', 45),
      (null, 'spotify',                'subscriptions', 'discretionary', 45),
      (null, 'hulu',                   'subscriptions', 'discretionary', 45),
      (null, 'disney+',                'subscriptions', 'discretionary', 45),
      (null, 'disney plus',            'subscriptions', 'discretionary', 45),
      (null, 'hbo',                    'subscriptions', 'discretionary', 45),
      (null, 'max.com',                'subscriptions', 'discretionary', 45),
      (null, 'paramount+',             'subscriptions', 'discretionary', 45),
      (null, 'youtube premium',        'subscriptions', 'discretionary', 45),
      (null, 'apple.com/bill',         'subscriptions', 'discretionary', 45),
      (null, 'icloud',                 'subscriptions', 'discretionary', 45),
      (null, 'google storage',         'subscriptions', 'discretionary', 45),
      (null, 'google one',             'subscriptions', 'discretionary', 45),
      (null, 'patreon',                'subscriptions', 'discretionary', 45),
      (null, 'substack',               'subscriptions', 'discretionary', 45),
      (null, 'adobe',                  'subscriptions', 'discretionary', 45),
      (null, 'audible',                'subscriptions', 'discretionary', 45),
      (null, 'chatgpt',                'subscriptions', 'discretionary', 45),
      (null, 'openai',                 'subscriptions', 'discretionary', 45),
      (null, 'planet fitness',         'fitness',       'discretionary', 45),
      (null, 'equinox',                'fitness',       'discretionary', 45),
      (null, 'peloton',                'fitness',       'discretionary', 45),
      (null, 'classpass',              'fitness',       'discretionary', 45),
      (null, 'gym',                    'fitness',       'discretionary', 46),
      (null, 'starbucks',              'coffee',        'discretionary', 48),
      (null, 'dunkin',                 'coffee',        'discretionary', 48),
      (null, 'peet',                   'coffee',        'discretionary', 48),
      (null, 'coffee',                 'coffee',        'discretionary', 49),
      (null, 'mcdonald',               'dining',        'discretionary', 50),
      (null, 'chipotle',               'dining',        'discretionary', 50),
      (null, 'taco bell',              'dining',        'discretionary', 50),
      (null, 'subway',                 'dining',        'discretionary', 50),
      (null, 'panera',                 'dining',        'discretionary', 50),
      (null, 'chick-fil-a',            'dining',        'discretionary', 50),
      (null, 'doordash',               'dining',        'discretionary', 50),
      (null, 'uber eats',              'dining',        'discretionary', 50),
      (null, 'ubereats',               'dining',        'discretionary', 50),
      (null, 'grubhub',                'dining',        'discretionary', 50),
      (null, 'postmates',              'dining',        'discretionary', 50),
      (null, 'restaurant',             'dining',        'discretionary', 52),
      (null, 'bar &',                  'dining',        'discretionary', 52),
      (null, 'uber',                   'transport',     'discretionary', 52),
      (null, 'lyft',                   'transport',     'discretionary', 52),
      (null, 'amazon',                 'shopping',      'discretionary', 54),
      (null, 'amzn',                   'shopping',      'discretionary', 54),
      (null, 'target',                 'shopping',      'discretionary', 54),
      (null, 'best buy',               'shopping',      'discretionary', 54),
      (null, 'etsy',                   'shopping',      'discretionary', 54),
      (null, 'ebay',                   'shopping',      'discretionary', 54),
      (null, 'shein',                  'shopping',      'discretionary', 54),
      (null, 'h&m',                    'shopping',      'discretionary', 54),
      (null, 'zara',                   'shopping',      'discretionary', 54),
      (null, 'nike',                   'shopping',      'discretionary', 54),
      (null, 'sephora',                'shopping',      'discretionary', 54),
      (null, 'ulta',                   'shopping',      'discretionary', 54),
      (null, 'steam',                  'entertainment', 'discretionary', 55),
      (null, 'playstation',            'entertainment', 'discretionary', 55),
      (null, 'xbox',                   'entertainment', 'discretionary', 55),
      (null, 'nintendo',               'entertainment', 'discretionary', 55),
      (null, 'amc',                    'entertainment', 'discretionary', 55),
      (null, 'cinemark',               'entertainment', 'discretionary', 55),
      (null, 'ticketmaster',           'entertainment', 'discretionary', 55),
      (null, 'stubhub',                'entertainment', 'discretionary', 55),
      (null, 'venmo',                  'transfer',      'transfer',      60),
      (null, 'zelle',                  'transfer',      'transfer',      60),
      (null, 'cash app',               'transfer',      'transfer',      60),
      (null, 'cashapp',                'transfer',      'transfer',      60),
      (null, 'transfer to',            'transfer',      'transfer',      60),
      (null, 'transfer from',          'transfer',      'transfer',      60),
      (null, 'online transfer',        'transfer',      'transfer',      60),
      (null, 'paypal',                 'transfer',      'transfer',      62),
      (null, 'atm withdrawal',         'cash',          'discretionary', 65),
      (null, 'atm ',                   'cash',          'discretionary', 66),
      (null, 'withdrawal',             'cash',          'discretionary', 67);
  end if;
end $$;

-- ============================================================================
-- Done.
-- ============================================================================
