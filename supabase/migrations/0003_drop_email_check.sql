-- ============================================================================
-- Drop email_has_account: it was useful for "this email is already registered"
-- UX guidance on the login page, but granting it to anon allowed scraping the
-- registered-emails list. Replaced by a uniform auth flow that uses
-- shouldCreateUser: true on both sign-in and sign-up and shows the same
-- "check your inbox" response in both cases — no signal leaks about whether
-- a given email is in the system.
-- ============================================================================

drop function if exists public.email_has_account(text);
