-- Make an invitation consume retry-safe for the same authenticated account.
-- A lost response or transient profile read after the atomic consume must not
-- strand that account on an invitation that it already successfully accepted.
-- Other accounts can never reuse a consumed invitation.
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
  if not found then
    raise exception 'Invitation is invalid, expired, or already used' using errcode = '22023';
  end if;

  if v_invite.status = 'consumed' then
    if v_invite.consumed_by = v_user_id
       and v_invite.intended_role = 'teacher'
       and v_profile.role = 'teacher' and v_profile.status = 'active' then
      return v_invite.id;
    end if;
    if v_invite.consumed_by = v_user_id
       and v_invite.intended_role = 'student'
       and v_profile.role = 'student' and v_profile.status = 'active'
       and exists (
         select 1 from public.classroom_memberships m
         where m.classroom_id = v_invite.classroom_id
           and m.student_id = v_user_id and m.status = 'active'
       ) then
      return v_invite.id;
    end if;
    raise exception 'Invitation is invalid, expired, or already used' using errcode = '22023';
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
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
  where id = v_invite.id and status = 'pending';
  if not found then
    raise exception 'Invitation changed while it was being consumed' using errcode = '40001';
  end if;
  return v_invite.id;
end;
$$;

revoke all on function public.consume_invitation(text) from public, anon;
grant execute on function public.consume_invitation(text) to authenticated;
