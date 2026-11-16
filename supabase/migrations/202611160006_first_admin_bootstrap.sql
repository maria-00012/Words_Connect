-- One-time, owner-authorized bootstrap for the first platform administrator.
-- The browser supplies only its authenticated Supabase session. The permitted
-- Auth UUID is configured out-of-band by the project owner in the SQL Editor.

create schema if not exists wc_private;
revoke all on schema wc_private from public, anon, authenticated;

create table wc_private.first_admin_bootstrap (
  singleton boolean primary key default true check (singleton),
  authorized_user_id uuid references auth.users(id) on delete restrict,
  claimed_by uuid references auth.users(id) on delete restrict,
  claimed_at timestamptz,
  check ((claimed_by is null) = (claimed_at is null)),
  check (claimed_by is null or claimed_by = authorized_user_id)
);

alter table wc_private.first_admin_bootstrap enable row level security;
revoke all on wc_private.first_admin_bootstrap from public, anon, authenticated;

insert into wc_private.first_admin_bootstrap (singleton)
values (true)
on conflict (singleton) do nothing;

-- If an administrator already exists when this migration is installed, close
-- bootstrap permanently. The deterministic first row is recorded for audit.
with existing_admin as (
  select p.id
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at, p.id
  limit 1
)
update wc_private.first_admin_bootstrap b
set authorized_user_id = a.id,
    claimed_by = a.id,
    claimed_at = now()
from existing_admin a
where b.singleton = true and b.claimed_at is null;

create or replace function wc_private.guard_first_admin_bootstrap_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, wc_private, pg_temp
as $$
begin
  if old.claimed_at is not null then
    if new.authorized_user_id is distinct from old.authorized_user_id
       or new.claimed_by is distinct from old.claimed_by
       or new.claimed_at is distinct from old.claimed_at then
      raise exception 'First-admin bootstrap is permanently claimed';
    end if;
    return new;
  end if;

  -- Only the trusted SQL Editor owner can configure this private row. Before
  -- claim, that owner may correct a mistaken UUID; clients have no table grant.
  if new.authorized_user_id is distinct from old.authorized_user_id
     and new.authorized_user_id is not null then
    if new.claimed_at is not null or new.claimed_by is not null then
      raise exception 'Authorization and claiming are separate operations';
    end if;
    if exists (select 1 from public.profiles p where p.role = 'admin') then
      raise exception 'An administrator already exists';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = new.authorized_user_id
        and p.role = 'student'
        and p.status in ('pending', 'active')
    ) then
      raise exception 'Authorized Auth user must have an eligible student profile';
    end if;
  end if;

  if new.claimed_at is not null then
    if old.claimed_at is not null
       or new.claimed_by is distinct from old.authorized_user_id
       or new.authorized_user_id is null then
      raise exception 'Invalid first-admin claim';
    end if;
  elsif new.claimed_by is not null then
    raise exception 'Claim timestamp is required';
  end if;
  return new;
end;
$$;

revoke all on function wc_private.guard_first_admin_bootstrap_state() from public, anon, authenticated;
create trigger guard_first_admin_bootstrap_state
  before update on wc_private.first_admin_bootstrap
  for each row execute function wc_private.guard_first_admin_bootstrap_state();

create or replace function public.bootstrap_first_admin()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, wc_private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_auth_user auth.users%rowtype;
  v_profile public.profiles%rowtype;
  v_state wc_private.first_admin_bootstrap%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_auth_user
  from auth.users u
  where u.id = v_user_id and u.email_confirmed_at is not null;
  if not found then
    raise exception 'A confirmed Auth email is required' using errcode = '42501';
  end if;

  select * into v_state
  from wc_private.first_admin_bootstrap b
  where b.singleton = true
  for update;
  if not found then
    raise exception 'Bootstrap state is missing' using errcode = '55000';
  end if;

  -- Read the profile only after acquiring the singleton lock. A concurrent
  -- retry then sees the committed admin profile instead of a stale snapshot.
  select * into v_profile
  from public.profiles p
  where p.id = v_user_id;
  if not found then
    raise exception 'The Auth account has no Words Connect profile' using errcode = '23503';
  end if;
  if lower(v_profile.email) is distinct from lower(v_auth_user.email) then
    raise exception 'The Auth account and profile email do not match' using errcode = '42501';
  end if;

  -- A response lost after COMMIT is safe to retry only for the same account.
  if v_state.claimed_at is not null then
    if v_state.claimed_by = v_user_id
       and v_profile.role = 'admin'
       and v_profile.status = 'active' then
      return v_user_id;
    end if;
    raise exception 'First-admin bootstrap has already been claimed' using errcode = '42501';
  end if;

  if v_state.authorized_user_id is null
     or v_state.authorized_user_id <> v_user_id then
    raise exception 'This Auth account is not authorized for first-admin bootstrap' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.role = 'admin') then
    raise exception 'An administrator already exists; bootstrap is unavailable' using errcode = '55000';
  end if;

  if v_profile.role <> 'student' or v_profile.status not in ('pending', 'active') then
    raise exception 'The authorized profile is not eligible for bootstrap' using errcode = '42501';
  end if;

  update public.profiles
  set role = 'admin', status = 'active', updated_at = now()
  where id = v_user_id and role = 'student' and status in ('pending', 'active');
  if not found then
    raise exception 'Profile changed during bootstrap; retry the operation' using errcode = '40001';
  end if;

  update wc_private.first_admin_bootstrap
  set claimed_by = v_user_id, claimed_at = now()
  where singleton = true and claimed_at is null;
  if not found then
    raise exception 'Bootstrap state changed during claim; retry the operation' using errcode = '40001';
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.bootstrap_first_admin() from public, anon;
grant execute on function public.bootstrap_first_admin() to authenticated;

comment on function public.bootstrap_first_admin() is
  'Promotes only the SQL-Editor-authorized authenticated Auth UUID once; repeated calls by that same active admin are idempotent.';
comment on table wc_private.first_admin_bootstrap is
  'Private one-time bootstrap authorization and permanent claim record. Never expose through the Supabase Data API.';
