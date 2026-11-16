-- RLS, invitation/archive operations, and realtime publication. All historical
-- work is retained. Client writes to student work and grades use validated RPCs.

create or replace function public.is_active_teacher()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'teacher' and p.status = 'active');
$$;
create or replace function public.classroom_is_open(p_classroom_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.classrooms c
    where c.id = p_classroom_id and c.status = 'open');
$$;
revoke all on function public.is_active_teacher() from public;
revoke all on function public.classroom_is_open(uuid) from public;
grant execute on function public.is_active_teacher() to authenticated;
grant execute on function public.classroom_is_open(uuid) to authenticated;

-- Provision exactly one long-lived wall activity when a classroom is created.
create or replace function public.create_default_appreciation_wall()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into public.classroom_activities
    (classroom_id, activity_type, title, status, position, created_by)
  values (new.id, 'appreciation', 'Appreciation Wall', 'open', 1, new.owner_teacher_id);
  return new;
end;
$$;
create trigger classroom_create_appreciation_wall
  after insert on public.classrooms
  for each row execute function public.create_default_appreciation_wall();

create or replace function public.create_invitation(
  p_token_hash text, p_intended_role text, p_email text,
  p_classroom_id uuid, p_expires_at timestamptz
)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now() then
    raise exception 'Invalid invitation request' using errcode = '22023';
  end if;
  if p_intended_role = 'teacher' then
    if not public.is_platform_admin() or p_classroom_id is not null
       or nullif(trim(p_email), '') is null then
      raise exception 'Only an admin may issue an email-bound teacher invitation';
    end if;
  elsif p_intended_role = 'student' then
    if p_classroom_id is null or not public.can_manage_classroom(p_classroom_id)
       or not public.classroom_is_open(p_classroom_id) then
      raise exception 'An authorized manager of an open classroom must issue this invitation'
        using errcode = '42501';
    end if;
  else
    raise exception 'Invalid invitation role' using errcode = '22023';
  end if;
  insert into public.invitations
    (classroom_id, intended_role, email, token_hash, created_by, expires_at)
  values (p_classroom_id, p_intended_role, nullif(lower(trim(p_email)), ''),
    p_token_hash, auth.uid(), p_expires_at) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_profile_status(p_profile_id uuid, p_status text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;
  if p_profile_id = auth.uid() or p_status not in ('active', 'suspended') then
    raise exception 'Invalid account status change' using errcode = '22023';
  end if;
  update public.profiles set status = p_status, updated_at = now()
  where id = p_profile_id and status <> 'pending';
  if not found then raise exception 'Profile not found or awaiting invitation'; end if;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_invite public.invitations%rowtype;
begin
  select * into v_invite from public.invitations
  where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v_invite.intended_role = 'teacher' then
    if not public.is_platform_admin() then
      raise exception 'Admin permission required' using errcode = '42501';
    end if;
  elsif not public.can_manage_classroom(v_invite.classroom_id) then
    raise exception 'Classroom manager permission required' using errcode = '42501';
  end if;
  if v_invite.status = 'pending' then
    update public.invitations set status = 'revoked', revoked_at = now()
    where id = p_invitation_id;
  end if;
end;
$$;

create or replace function public.archive_classroom(p_classroom_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.can_manage_classroom(p_classroom_id) then
    raise exception 'Classroom manager permission required' using errcode = '42501';
  end if;
  update public.classrooms set status = 'archived',
    archived_at = coalesce(archived_at, now()), updated_at = now()
  where id = p_classroom_id and status = 'open';
end;
$$;

create or replace function public.reopen_classroom(p_classroom_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.can_manage_classroom(p_classroom_id) then
    raise exception 'Classroom manager permission required' using errcode = '42501';
  end if;
  update public.classrooms set status = 'open', archived_at = null, updated_at = now()
  where id = p_classroom_id and status = 'archived';
  -- Existing settings and child records are unchanged; no rows are copied.
end;
$$;

revoke all on function public.create_invitation(text, text, text, uuid, timestamptz) from public;
revoke all on function public.set_profile_status(uuid, text) from public;
revoke all on function public.revoke_invitation(uuid) from public;
revoke all on function public.archive_classroom(uuid) from public;
revoke all on function public.reopen_classroom(uuid) from public;
grant execute on function public.create_invitation(text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.set_profile_status(uuid, text) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.archive_classroom(uuid) to authenticated;
grant execute on function public.reopen_classroom(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_staff enable row level security;
alter table public.invitations enable row level security;
alter table public.classroom_memberships enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_versions enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answer_keys enable row level security;
alter table public.classroom_activities enable row level security;
alter table public.academic_exercises enable row level security;
alter table public.academic_exercise_assignments enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_items enable row level security;
alter table public.student_progress enable row level security;
alter table public.activity_submissions enable row level security;
alter table public.automated_assessments enable row level security;
alter table public.teacher_assessments enable row level security;
alter table public.grade_audit_events enable row level security;

revoke all on public.profiles, public.classrooms, public.classroom_staff,
  public.invitations, public.classroom_memberships, public.quizzes,
  public.quiz_versions, public.quiz_questions, public.quiz_answer_keys,
  public.classroom_activities, public.academic_exercises,
  public.academic_exercise_assignments, public.quiz_attempts,
  public.quiz_attempt_items, public.student_progress,
  public.activity_submissions, public.automated_assessments,
  public.teacher_assessments, public.grade_audit_events from anon, authenticated;

grant select on public.profiles, public.classrooms, public.classroom_staff,
  public.classroom_memberships, public.quizzes, public.quiz_versions,
  public.quiz_questions, public.quiz_answer_keys, public.classroom_activities,
  public.academic_exercises, public.academic_exercise_assignments,
  public.quiz_attempts, public.quiz_attempt_items, public.student_progress,
  public.activity_submissions, public.automated_assessments,
  public.teacher_assessments, public.grade_audit_events to authenticated;
-- The global revoke above is intentionally not followed by INSERT/UPDATE/
-- DELETE grants for teacher_assessments or grade_audit_events. No direct-write
-- policies are defined for either table; grading uses the guarded RPC only.
grant update (display_name) on public.profiles to authenticated;
grant insert (owner_teacher_id, name) on public.classrooms to authenticated;
grant update (name, current_stage, wall_open, submissions_open, awards_revealed, updated_at)
  on public.classrooms to authenticated;
grant select (classroom_id, teacher_id, permission, created_at)
  on public.classroom_staff to authenticated;
grant insert, delete on public.classroom_staff to authenticated;
grant insert on public.classroom_memberships to authenticated;
grant update (status, ended_at, invitation_id) on public.classroom_memberships to authenticated;
grant select (id, classroom_id, intended_role, email, status, created_by,
  expires_at, consumed_by, consumed_at, revoked_at, created_at)
  on public.invitations to authenticated;
grant insert (classroom_id, title) on public.quizzes to authenticated;
grant update (title) on public.quizzes to authenticated;
grant insert (classroom_id, quiz_id, version_number) on public.quiz_versions to authenticated;
grant insert, update, delete on public.quiz_questions, public.quiz_answer_keys to authenticated;
grant insert (classroom_id, activity_type, title, status, position, prompt_snapshot,
  quiz_version_id) on public.classroom_activities to authenticated;
grant update (title, status, position, prompt_snapshot, quiz_version_id, updated_at)
  on public.classroom_activities to authenticated;
grant insert (classroom_id, exercise_family_id, version_number, title,
  source_sentence, status) on public.academic_exercises to authenticated;
grant update (status) on public.academic_exercises to authenticated;
grant insert (classroom_id, activity_instance_id, exercise_id,
  source_sentence_snapshot, exercise_title_snapshot)
  on public.academic_exercise_assignments to authenticated;
grant update (exercise_id, source_sentence_snapshot, exercise_title_snapshot)
  on public.academic_exercise_assignments to authenticated;
grant delete on public.quiz_questions, public.quiz_answer_keys to authenticated;

create policy profiles_read_self_staff_admin on public.profiles for select to authenticated using (
  (id = auth.uid() and status <> 'suspended') or public.is_platform_admin()
  or exists (select 1 from public.classroom_memberships m
    where m.student_id = profiles.id and public.has_classroom_staff_access(m.classroom_id))
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and status = 'active')
  with check (id = auth.uid() and status = 'active');

create policy classrooms_read_authorized on public.classrooms for select to authenticated
  using (public.can_view_classroom(id));
create policy classrooms_insert_teacher_owned on public.classrooms for insert to authenticated
  with check (owner_teacher_id = auth.uid() and public.is_active_teacher()
    and status = 'open' and archived_at is null);
create policy classrooms_update_open_managers on public.classrooms for update to authenticated
  using (status = 'open' and public.can_manage_classroom(id))
  with check (public.can_manage_classroom(id));

create policy staff_read_authorized on public.classroom_staff for select to authenticated
  using (public.can_view_classroom(classroom_id));
create policy staff_insert_manager on public.classroom_staff for insert to authenticated
  with check (public.can_manage_classroom(classroom_id)
    and public.classroom_is_open(classroom_id)
    and exists (select 1 from public.profiles p where p.id = teacher_id
      and p.role = 'teacher' and p.status = 'active'));
create policy staff_update_manager on public.classroom_staff for update to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id));
create policy staff_delete_manager on public.classroom_staff for delete to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id));

create policy membership_read_self_staff on public.classroom_memberships for select to authenticated
  using (public.is_active_profile()
    and (student_id = auth.uid() or public.has_classroom_staff_access(classroom_id)));
create policy membership_insert_manager on public.classroom_memberships for insert to authenticated
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id)
    and exists (select 1 from public.profiles p where p.id = student_id
      and p.role = 'student' and p.status = 'active'));
create policy membership_update_manager on public.classroom_memberships for update to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id)
    and exists (select 1 from public.profiles p where p.id = student_id and p.role = 'student'));

create policy invitation_metadata_read on public.invitations for select to authenticated using (
  (intended_role = 'teacher' and public.is_platform_admin())
  or (intended_role = 'student' and public.can_manage_classroom(classroom_id))
);

-- Shared policy shape: classroom staff see managed reports; active members may
-- read published classroom content. Removed students retain only their own
-- historical records and snapshots, not current classroom content.
create policy quizzes_read on public.quizzes for select to authenticated using (
  public.has_classroom_staff_access(classroom_id)
  or (public.has_classroom_membership(classroom_id)
    and (public.has_active_classroom_membership(classroom_id)
      or exists (select 1 from public.classrooms c where c.id = classroom_id and c.status = 'archived')))
);
create policy quizzes_write_manager on public.quizzes for all to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id));
create policy quiz_versions_read on public.quiz_versions for select to authenticated using (
  public.has_classroom_staff_access(classroom_id)
  or (public.has_classroom_membership(classroom_id)
    and (public.has_active_classroom_membership(classroom_id)
      or exists (select 1 from public.classrooms c where c.id = classroom_id and c.status = 'archived')))
    and status <> 'draft'
);
create policy quiz_versions_write_manager on public.quiz_versions for all to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id));
create policy questions_read on public.quiz_questions for select to authenticated using (
  public.has_classroom_staff_access(classroom_id)
  or (exists (
    select 1 from public.quiz_versions v
    where v.classroom_id = quiz_questions.classroom_id
      and v.id = quiz_version_id and v.status <> 'draft'
  ) and public.has_classroom_membership(classroom_id)
    and (public.has_active_classroom_membership(classroom_id)
      or exists (select 1 from public.classrooms c where c.id = classroom_id and c.status = 'archived')))
);
create policy questions_write_draft on public.quiz_questions for all to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id)
    and exists (select 1 from public.quiz_versions v where v.classroom_id = quiz_questions.classroom_id
      and v.id = quiz_version_id and v.status = 'draft'))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id)
    and exists (select 1 from public.quiz_versions v where v.classroom_id = quiz_questions.classroom_id
      and v.id = quiz_version_id and v.status = 'draft'));
create policy answer_keys_read_grader on public.quiz_answer_keys for select to authenticated
  using (public.can_grade_classroom(classroom_id));
create policy answer_keys_write_draft on public.quiz_answer_keys for all to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id)
    and exists (select 1 from public.quiz_questions q join public.quiz_versions v
      on v.classroom_id = q.classroom_id and v.id = q.quiz_version_id
      where q.classroom_id = quiz_answer_keys.classroom_id
        and q.id = question_id and v.status = 'draft'))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id)
    and exists (select 1 from public.quiz_questions q join public.quiz_versions v
      on v.classroom_id = q.classroom_id and v.id = q.quiz_version_id
      where q.classroom_id = quiz_answer_keys.classroom_id
        and q.id = question_id and v.status = 'draft'));

create policy activities_read on public.classroom_activities for select to authenticated using (
  public.has_classroom_staff_access(classroom_id)
  or (public.has_classroom_membership(classroom_id)
    and (public.has_active_classroom_membership(classroom_id)
      or exists (select 1 from public.classrooms c where c.id = classroom_id and c.status = 'archived')))
);
create policy activities_write_manager on public.classroom_activities for all to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id));
create policy exercises_read on public.academic_exercises for select to authenticated using (
  public.has_classroom_staff_access(classroom_id)
  or (public.has_classroom_membership(classroom_id)
    and (public.has_active_classroom_membership(classroom_id)
      or exists (select 1 from public.classrooms c where c.id = classroom_id and c.status = 'archived')))
);
create policy exercises_write_manager on public.academic_exercises for all to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id));
create policy assignments_read on public.academic_exercise_assignments for select to authenticated using (
  public.has_classroom_staff_access(classroom_id)
  or (public.has_classroom_membership(classroom_id)
    and (public.has_active_classroom_membership(classroom_id)
      or exists (select 1 from public.classrooms c where c.id = classroom_id and c.status = 'archived')))
);
create policy assignments_write_manager on public.academic_exercise_assignments for all to authenticated
  using (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id))
  with check (public.can_manage_classroom(classroom_id) and public.classroom_is_open(classroom_id));

create policy progress_read_self_staff on public.student_progress for select to authenticated
  using (public.is_active_profile()
    and (student_id = auth.uid() or public.has_classroom_staff_access(classroom_id)));
create policy submissions_read_self_wall_staff on public.activity_submissions for select to authenticated
  using (public.is_active_profile()
    and (public.has_classroom_staff_access(classroom_id) or student_id = auth.uid()
    or (public.has_active_classroom_membership(classroom_id)
      and exists (select 1 from public.classroom_activities a
        where a.classroom_id = activity_submissions.classroom_id
          and a.id = activity_instance_id and a.activity_type = 'appreciation'))));
create policy attempts_read_self_staff on public.quiz_attempts for select to authenticated
  using (public.is_active_profile()
    and (student_id = auth.uid() or public.has_classroom_staff_access(classroom_id)));
create policy attempt_items_read_self_staff on public.quiz_attempt_items for select to authenticated
  using (public.is_active_profile() and exists (select 1 from public.quiz_attempts a
    where a.classroom_id = quiz_attempt_items.classroom_id and a.id = attempt_id
      and (a.student_id = auth.uid() or public.has_classroom_staff_access(a.classroom_id))));
create policy automated_results_read_self_staff on public.automated_assessments for select to authenticated
  using (public.is_active_profile() and (public.has_classroom_staff_access(classroom_id) or exists (
    select 1 from public.activity_submissions s where s.classroom_id = automated_assessments.classroom_id
      and s.id = submission_id and s.student_id = auth.uid())));
create policy teacher_assessments_read_self_reviewed_staff on public.teacher_assessments for select to authenticated
  using (public.is_active_profile() and (public.has_classroom_staff_access(classroom_id) or (status = 'reviewed' and exists (
    select 1 from public.activity_submissions s where s.classroom_id = teacher_assessments.classroom_id
      and s.id = submission_id and s.student_id = auth.uid()))));
create policy grade_audit_read_graders on public.grade_audit_events for select to authenticated
  using (public.is_active_profile() and public.has_classroom_staff_access(classroom_id));

-- Add only RLS-protected tables needed for classroom activity updates. Presence
-- is ephemeral Realtime state and is not persisted as student progress.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'classrooms') then
      alter publication supabase_realtime add table public.classrooms;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'activity_submissions') then
      alter publication supabase_realtime add table public.activity_submissions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'student_progress') then
      alter publication supabase_realtime add table public.student_progress;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'quiz_attempts') then
      alter publication supabase_realtime add table public.quiz_attempts;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'teacher_assessments') then
      alter publication supabase_realtime add table public.teacher_assessments;
    end if;
  end if;
end;
$$;

comment on function public.consume_invitation(text) is
  'Atomically consumes one hashed invitation and assigns its authorized role/membership.';
comment on function public.archive_classroom(uuid) is
  'Archives the existing classroom row without copying records or changing settings.';
comment on function public.reopen_classroom(uuid) is
  'Reopens the same classroom row without duplicating data or overwriting settings.';
