-- Words Connect Supabase schema: identity, classroom ownership, staff,
-- memberships, and invitation records. This migration is additive.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '',
  email text not null,
  role text not null default 'student'
    check (role in ('student', 'teacher', 'admin')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_normalized_uidx
  on public.profiles (lower(email));

-- Auth metadata may supply a display name only. Role and status are assigned
-- by trusted invitation/admin operations, never copied from user metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, email, role, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), ''),
    lower(new.email),
    'student',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_words_connect
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email), updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated_words_connect
  after update of email on auth.users
  for each row execute function public.sync_auth_user_email();

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'archived')),
  current_stage smallint not null default 0 check (current_stage between 0 and 4),
  wall_open boolean not null default true,
  submissions_open boolean not null default true,
  awards_revealed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, owner_teacher_id),
  check ((status = 'archived') = (archived_at is not null))
);

create index classrooms_owner_status_updated_idx
  on public.classrooms (owner_teacher_id, status, updated_at desc);
create index classrooms_open_owner_idx
  on public.classrooms (owner_teacher_id, created_at desc)
  where status = 'open';

create table public.classroom_staff (
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  permission text not null check (permission in ('manager', 'grader', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (classroom_id, teacher_id)
);

create index classroom_staff_teacher_idx
  on public.classroom_staff (teacher_id, classroom_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms(id) on delete restrict,
  intended_role text not null check (intended_role in ('student', 'teacher')),
  email text,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'revoked', 'expired')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  consumed_by uuid references public.profiles(id) on delete restrict,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (intended_role = 'student' and classroom_id is not null)
    or (intended_role = 'teacher' and classroom_id is null and email is not null)
  ),
  check (
    (status = 'consumed' and consumed_at is not null and consumed_by is not null)
    or (status <> 'consumed' and consumed_at is null and consumed_by is null)
  ),
  check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create index invitations_pending_classroom_expiry_idx
  on public.invitations (classroom_id, expires_at)
  where status = 'pending';
create index invitations_email_status_idx
  on public.invitations (lower(email), status)
  where email is not null;

create table public.classroom_memberships (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'removed')),
  invitation_id uuid references public.invitations(id) on delete set null,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (classroom_id, student_id),
  unique (classroom_id, id),
  check ((status = 'active') = (ended_at is null))
);

create index memberships_student_status_classroom_idx
  on public.classroom_memberships (student_id, status, classroom_id);
create index memberships_classroom_status_student_idx
  on public.classroom_memberships (classroom_id, status, student_id);

create or replace function public.validate_classroom_participant_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_role text;
  v_owner_status text;
  v_student_role text;
  v_student_status text;
begin
  if tg_table_name = 'classrooms' then
    select role, status into v_owner_role, v_owner_status
    from public.profiles where id = new.owner_teacher_id;
    if v_owner_role <> 'teacher' or v_owner_status <> 'active' then
      raise exception 'A classroom owner must be an active teacher';
    end if;
  elsif tg_table_name = 'classroom_memberships' then
    select role, status into v_student_role, v_student_status
    from public.profiles where id = new.student_id;
    if v_student_role <> 'student'
       or (new.status = 'active' and v_student_status <> 'active') then
      raise exception 'Memberships require a student account; active memberships require an active account';
    end if;
  elsif tg_table_name = 'classroom_staff' then
    select role, status into v_owner_role, v_owner_status
    from public.profiles where id = new.teacher_id;
    if v_owner_role <> 'teacher' or v_owner_status <> 'active' then
      raise exception 'Classroom staff must be active teachers';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger validate_classroom_owner_role
  before insert or update of owner_teacher_id on public.classrooms
  for each row execute function public.validate_classroom_participant_roles();
create trigger validate_membership_student_role
  before insert or update of student_id, status on public.classroom_memberships
  for each row execute function public.validate_classroom_participant_roles();
create trigger validate_classroom_staff_teacher_role
  before insert or update of teacher_id on public.classroom_staff
  for each row execute function public.validate_classroom_participant_roles();

-- These helpers centralize classroom authorization. Removed memberships count
-- for historical reads; active membership is checked separately for writes.
create or replace function public.is_active_profile()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

create or replace function public.has_classroom_membership(p_classroom_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.classroom_memberships m
    where m.classroom_id = p_classroom_id and m.student_id = auth.uid()
  );
$$;

create or replace function public.has_active_classroom_membership(p_classroom_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_active_profile() and exists (
    select 1 from public.profiles p
    join public.classroom_memberships m on m.student_id = p.id
    where p.id = auth.uid() and p.role = 'student'
      and m.classroom_id = p_classroom_id and m.status = 'active'
  );
$$;

create or replace function public.can_view_classroom(p_classroom_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_active_profile() and (
    exists (
      select 1 from public.classrooms c
      where c.id = p_classroom_id and c.owner_teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.classroom_staff s
      where s.classroom_id = p_classroom_id and s.teacher_id = auth.uid()
    )
    or public.has_classroom_membership(p_classroom_id)
  );
$$;

create or replace function public.can_manage_classroom(p_classroom_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_active_profile() and (
    exists (
      select 1 from public.classrooms c
      where c.id = p_classroom_id and c.owner_teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.classroom_staff s
      where s.classroom_id = p_classroom_id
        and s.teacher_id = auth.uid() and s.permission = 'manager'
    )
  );
$$;

create or replace function public.has_classroom_staff_access(p_classroom_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_active_profile() and (
    exists (
      select 1 from public.classrooms c
      where c.id = p_classroom_id and c.owner_teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.classroom_staff s
      where s.classroom_id = p_classroom_id and s.teacher_id = auth.uid()
    )
  );
$$;

create or replace function public.can_grade_classroom(p_classroom_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_active_profile() and (
    exists (
      select 1 from public.classrooms c
      where c.id = p_classroom_id and c.owner_teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.classroom_staff s
      where s.classroom_id = p_classroom_id
        and s.teacher_id = auth.uid()
        and s.permission in ('manager', 'grader')
    )
  );
$$;

revoke all on function public.is_active_profile() from public;
revoke all on function public.is_platform_admin() from public;
revoke all on function public.has_classroom_membership(uuid) from public;
revoke all on function public.has_active_classroom_membership(uuid) from public;
revoke all on function public.can_view_classroom(uuid) from public;
revoke all on function public.can_manage_classroom(uuid) from public;
revoke all on function public.has_classroom_staff_access(uuid) from public;
revoke all on function public.can_grade_classroom(uuid) from public;
grant execute on function public.is_active_profile() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_classroom_membership(uuid) to authenticated;
grant execute on function public.has_active_classroom_membership(uuid) to authenticated;
grant execute on function public.can_view_classroom(uuid) to authenticated;
grant execute on function public.can_manage_classroom(uuid) to authenticated;
grant execute on function public.has_classroom_staff_access(uuid) to authenticated;
grant execute on function public.can_grade_classroom(uuid) to authenticated;

-- Called only after Auth has created an identity. The invitation is the
-- authority for role activation and membership; possession of client metadata
-- cannot grant either. Edge code should hash the raw high-entropy token.
create or replace function public.consume_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_invite public.invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles
  where id = v_user_id for update;
  if not found or v_profile.status = 'suspended' then
    raise exception 'Account cannot consume invitations' using errcode = '42501';
  end if;

  select * into v_invite from public.invitations
  where token_hash = p_token_hash for update;
  if not found or v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'Invitation is invalid, expired, or already used' using errcode = '22023';
  end if;
  if v_invite.email is not null and lower(v_invite.email) <> lower(v_profile.email) then
    raise exception 'Invitation email does not match' using errcode = '42501';
  end if;
  if v_invite.email is not null and not exists (
    select 1 from auth.users u where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'Verify the invited email address before consuming this invitation'
      using errcode = '42501';
  end if;

  if v_invite.intended_role = 'teacher' then
    if v_profile.status <> 'pending' or v_profile.role <> 'student' then
      raise exception 'Teacher invitation requires a pending account' using errcode = '42501';
    end if;
    update public.profiles set role = 'teacher', status = 'active', updated_at = now()
    where id = v_user_id;
  else
    if v_profile.role <> 'student' then
      raise exception 'Account role cannot join as a student' using errcode = '42501';
    end if;
    if v_profile.status = 'pending' then
      update public.profiles set role = 'student', status = 'active', updated_at = now()
      where id = v_user_id;
    end if;
    if not exists (
      select 1 from public.classrooms c
      where c.id = v_invite.classroom_id and c.status = 'open'
    ) then
      raise exception 'Classroom is not open' using errcode = '22023';
    end if;
    insert into public.classroom_memberships
      (classroom_id, student_id, status, invitation_id, joined_at, ended_at)
    values (v_invite.classroom_id, v_user_id, 'active', v_invite.id, now(), null)
    on conflict (classroom_id, student_id) do update
      set status = 'active', invitation_id = excluded.invitation_id,
          joined_at = now(), ended_at = null;
  end if;

  update public.invitations
  set status = 'consumed', consumed_by = v_user_id, consumed_at = now()
  where id = v_invite.id;
  return v_invite.id;
end;
$$;

revoke all on function public.consume_invitation(text) from public;
grant execute on function public.consume_invitation(text) to authenticated;

comment on table public.classrooms is
  'One row is one independent classroom; there is intentionally no sections hierarchy.';
comment on table public.classroom_memberships is
  'Removed memberships are retained for historical reads; write operations require status=active.';
comment on column public.invitations.token_hash is
  'Hash of a high-entropy invitation token. Raw bearer tokens are never stored.';
