-- Manual regression assertions for the one-time administrator bootstrap.
-- Run as the database owner against a disposable Supabase database.
-- Required variables: bootstrap_authorized_user_id,
-- bootstrap_unauthorized_user_id, bootstrap_existing_admin_user_id.
-- All three Auth users must have confirmed email and a matching profiles row.
-- The bootstrap profile is a student with pending or active status; the other
-- two profiles must be students before this test starts.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('wc.test.bootstrap_authorized_user_id', :'bootstrap_authorized_user_id', true);
SELECT set_config('wc.test.bootstrap_unauthorized_user_id', :'bootstrap_unauthorized_user_id', true);
SELECT set_config('wc.test.bootstrap_existing_admin_user_id', :'bootstrap_existing_admin_user_id', true);

DO $$
BEGIN
  IF (SELECT authorized_user_id FROM wc_private.first_admin_bootstrap WHERE singleton)
       IS DISTINCT FROM current_setting('wc.test.bootstrap_authorized_user_id')::uuid THEN
    RAISE EXCEPTION 'The disposable fixture must authorize the expected Auth UUID first';
  END IF;
  IF (SELECT claimed_at FROM wc_private.first_admin_bootstrap WHERE singleton) IS NOT NULL THEN
    RAISE EXCEPTION 'The disposable fixture must be unclaimed before tests start';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'The unauthorized/success fixture requires a database with no admins';
  END IF;
  IF current_setting('wc.test.bootstrap_authorized_user_id')::uuid = current_setting('wc.test.bootstrap_unauthorized_user_id')::uuid
     OR current_setting('wc.test.bootstrap_authorized_user_id')::uuid = current_setting('wc.test.bootstrap_existing_admin_user_id')::uuid
     OR current_setting('wc.test.bootstrap_unauthorized_user_id')::uuid = current_setting('wc.test.bootstrap_existing_admin_user_id')::uuid THEN
    RAISE EXCEPTION 'Use three distinct Auth user UUIDs';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      current_setting('wc.test.bootstrap_authorized_user_id')::uuid,
      current_setting('wc.test.bootstrap_unauthorized_user_id')::uuid,
      current_setting('wc.test.bootstrap_existing_admin_user_id')::uuid
    ]) AS fixture_id(id)
    LEFT JOIN auth.users u ON u.id = fixture_id.id
    LEFT JOIN public.profiles p ON p.id = fixture_id.id
    WHERE u.id IS NULL OR u.email_confirmed_at IS NULL
       OR p.id IS NULL OR p.role <> 'student'
       OR p.status NOT IN ('pending', 'active')
  ) THEN
    RAISE EXCEPTION 'All fixture accounts need confirmed Auth users and eligible student profiles';
  END IF;
END;
$$;

-- An ordinary authenticated user cannot call the RPC as someone else and
-- cannot read the private authorization/state table through normal SQL grants.
SELECT set_config('request.jwt.claim.sub', :'bootstrap_unauthorized_user_id', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.bootstrap_first_admin();
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Unauthorized Auth UUID was accepted'; END IF;

  v_rejected := false;
  BEGIN
    EXECUTE 'select authorized_user_id from wc_private.first_admin_bootstrap';
  EXCEPTION WHEN insufficient_privilege THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Authenticated role read private bootstrap state'; END IF;
END;
$$;
RESET ROLE;

-- Successful provisioning and a lost-response retry return the same UUID and
-- leave exactly one permanent claim.
SAVEPOINT bootstrap_success_case;
SELECT set_config('request.jwt.claim.sub', :'bootstrap_authorized_user_id', true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_first_admin() AS first_claim;
SELECT public.bootstrap_first_admin() AS safe_retry;
RESET ROLE;
DO $$
DECLARE v_state wc_private.first_admin_bootstrap%rowtype;
BEGIN
  SELECT * INTO v_state FROM wc_private.first_admin_bootstrap WHERE singleton;
  IF v_state.claimed_by IS DISTINCT FROM current_setting('wc.test.bootstrap_authorized_user_id')::uuid
     OR v_state.claimed_at IS NULL THEN
    RAISE EXCEPTION 'Successful call did not permanently claim bootstrap for the authorized UUID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = current_setting('wc.test.bootstrap_authorized_user_id')::uuid AND role = 'admin' AND status = 'active') THEN
    RAISE EXCEPTION 'Successful call did not activate the authorized admin profile';
  END IF;
END;
$$;
ROLLBACK TO SAVEPOINT bootstrap_success_case;

-- Simulate an administrator row that exists while the state is still
-- unclaimed (the same defensive check needed if state/records are restored).
UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE id = :'bootstrap_existing_admin_user_id'::uuid;
SELECT set_config('request.jwt.claim.sub', :'bootstrap_authorized_user_id', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.bootstrap_first_admin();
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Bootstrap proceeded despite an existing admin profile'; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM wc_private.first_admin_bootstrap WHERE singleton AND claimed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Existing-admin rejection changed the bootstrap claim state';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles
    WHERE id = current_setting('wc.test.bootstrap_authorized_user_id')::uuid AND role = 'admin') THEN
    RAISE EXCEPTION 'Existing-admin rejection promoted the authorized profile';
  END IF;
END;
$$;

ROLLBACK;
