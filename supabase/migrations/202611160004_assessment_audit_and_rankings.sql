-- Automated assessment stays separate from official teacher assessment.
-- Ranking data is derived from reviewed marks and is not stored redundantly.

create table public.automated_assessments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  submission_id uuid not null,
  engine text not null,
  rubric_version text not null,
  score numeric(5,2) not null check (score between 0 and 100),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (classroom_id, submission_id)
    references public.activity_submissions(classroom_id, id) on delete restrict,
  unique (submission_id, engine, rubric_version)
);

create index automated_assessments_submission_recent_idx
  on public.automated_assessments (submission_id, created_at desc);

create table public.teacher_assessments (
  classroom_id uuid not null,
  submission_id uuid primary key,
  official_mark numeric(5,2) check (official_mark between 0 and 100),
  feedback text not null default '',
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (classroom_id, submission_id)
    references public.activity_submissions(classroom_id, id) on delete restrict,
  check (
    (status = 'reviewed' and official_mark is not null
      and reviewed_by is not null and reviewed_at is not null)
    or (status = 'pending' and reviewed_by is null and reviewed_at is null)
  )
);

create index teacher_assessments_classroom_status_updated_idx
  on public.teacher_assessments (classroom_id, status, updated_at desc);

-- Enforce archive read-only at the table boundary as well as in the RPC. The
-- row lock serializes grading against archive_classroom/reopen_classroom.
create or replace function public.guard_teacher_assessment_write()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_classroom_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Teacher assessments cannot be deleted; retain the record and return it to pending if needed'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and (
    new.classroom_id is distinct from old.classroom_id
    or new.submission_id is distinct from old.submission_id
  ) then
    raise exception 'Teacher assessment identity is immutable' using errcode = '55000';
  end if;
  select status into v_classroom_status
  from public.classrooms
  where id = new.classroom_id
  for update;
  if not found then
    raise exception 'Classroom not found' using errcode = '23503';
  end if;
  if v_classroom_status <> 'open' then
    raise exception 'Archived classroom grades are read-only' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger guard_teacher_assessment_write
  before insert or update or delete on public.teacher_assessments
  for each row execute function public.guard_teacher_assessment_write();

create table public.grade_audit_events (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  submission_id uuid not null,
  changed_by uuid references public.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('teacher', 'admin', 'system')),
  event_type text not null check (
    event_type in ('created', 'mark_changed', 'feedback_changed', 'reviewed',
                   'returned_to_pending', 'legacy_import')
  ),
  old_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (classroom_id, submission_id)
    references public.activity_submissions(classroom_id, id) on delete restrict
);

create index grade_audit_submission_recent_idx
  on public.grade_audit_events (submission_id, created_at desc);

create or replace function public.prevent_grade_audit_rewrite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Grade audit events are immutable' using errcode = '55000';
end;
$$;

create trigger grade_audit_events_immutable
  before update or delete on public.grade_audit_events
  for each row execute function public.prevent_grade_audit_rewrite();

create or replace function public.prevent_grade_history_truncate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Teacher assessments and grade audit history cannot be truncated'
    using errcode = '55000';
end;
$$;

create trigger teacher_assessments_no_truncate
  before truncate on public.teacher_assessments
  for each statement execute function public.prevent_grade_history_truncate();
create trigger grade_audit_events_no_truncate
  before truncate on public.grade_audit_events
  for each statement execute function public.prevent_grade_history_truncate();

create or replace function public.audit_teacher_assessment_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_changed boolean;
  v_role text;
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_changed := new.official_mark is not null or new.feedback <> '' or new.status = 'reviewed';
    v_event := 'created';
  else
    v_changed := row(new.official_mark, new.feedback, new.status, new.reviewed_by, new.reviewed_at)
      is distinct from row(old.official_mark, old.feedback, old.status, old.reviewed_by, old.reviewed_at);
    if not v_changed then return new; end if;
    if old.status <> 'reviewed' and new.status = 'reviewed' then
      v_event := 'reviewed';
    elsif old.status = 'reviewed' and new.status = 'pending' then
      v_event := 'returned_to_pending';
    elsif old.official_mark is distinct from new.official_mark then
      v_event := 'mark_changed';
    else
      v_event := 'feedback_changed';
    end if;
  end if;
  if not v_changed then return new; end if;
  select role into v_role from public.profiles where id = auth.uid();
  insert into public.grade_audit_events
    (classroom_id, submission_id, changed_by, actor_type, event_type, old_values, new_values)
  values (
    new.classroom_id, new.submission_id, auth.uid(),
    case when auth.uid() is null then 'system'
         when v_role = 'admin' then 'admin'
         else 'teacher' end,
    v_event,
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'official_mark', old.official_mark, 'feedback', old.feedback,
      'status', old.status, 'reviewed_by', old.reviewed_by,
      'reviewed_at', old.reviewed_at) else null end,
    jsonb_build_object(
      'official_mark', new.official_mark, 'feedback', new.feedback,
      'status', new.status, 'reviewed_by', new.reviewed_by,
      'reviewed_at', new.reviewed_at)
  );
  return new;
end;
$$;

create trigger audit_teacher_assessment
  after insert or update on public.teacher_assessments
  for each row execute function public.audit_teacher_assessment_change();

create or replace function public.create_pending_teacher_assessment()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.teacher_assessments (classroom_id, submission_id)
  values (new.classroom_id, new.id)
  on conflict (submission_id) do nothing;
  return new;
end;
$$;

create trigger create_submission_teacher_assessment
  after insert on public.activity_submissions
  for each row execute function public.create_pending_teacher_assessment();

create or replace function public.set_teacher_assessment(
  p_submission_id uuid,
  p_official_mark numeric,
  p_feedback text,
  p_status text
)
returns public.teacher_assessments
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_classroom uuid;
  v_classroom_status text;
  v_result public.teacher_assessments%rowtype;
  v_feedback text := coalesce(p_feedback, '');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_status not in ('pending', 'reviewed') then raise exception 'Invalid review status'; end if;
  if p_official_mark is not null and (p_official_mark < 0 or p_official_mark > 100) then
    raise exception 'Official mark must be between 0 and 100';
  end if;
  select classroom_id into v_classroom
  from public.activity_submissions where id = p_submission_id;
  if not found or not public.can_grade_classroom(v_classroom) then
    raise exception 'Grading permission required' using errcode = '42501';
  end if;
  -- Lock against concurrent archiving. The table trigger repeats this guard so
  -- direct writes cannot bypass the RPC's archived-classroom check.
  select status into v_classroom_status from public.classrooms
  where id = v_classroom for update;
  if v_classroom_status <> 'open' then
    raise exception 'Archived classroom grades are read-only' using errcode = '55000';
  end if;
  if p_status = 'reviewed' and p_official_mark is null then
    raise exception 'A reviewed assessment requires an official mark';
  end if;
  insert into public.teacher_assessments
    (classroom_id, submission_id, official_mark, feedback, status,
     reviewed_by, reviewed_at, updated_at)
  values (
    v_classroom, p_submission_id, p_official_mark, v_feedback, p_status,
    case when p_status = 'reviewed' then auth.uid() else null end,
    case when p_status = 'reviewed' then now() else null end, now()
  )
  on conflict (submission_id) do update set
    official_mark = excluded.official_mark,
    feedback = excluded.feedback,
    status = excluded.status,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

-- The function is the only authenticated write path for official assessment.
create or replace function public.get_classroom_rankings(p_classroom_id uuid)
returns table (
  student_id uuid,
  display_name text,
  official_average numeric,
  reviewed_activity_count bigint,
  rank_position bigint
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_view_classroom(p_classroom_id) then
    raise exception 'Classroom access required' using errcode = '42501';
  end if;
  if not public.has_classroom_staff_access(p_classroom_id)
     and not exists (
       select 1 from public.classrooms c
       where c.id = p_classroom_id and c.awards_revealed
     ) then
    return;
  end if;

  return query
  with reviewed_versions as (
    select s.classroom_id, s.student_id, s.activity_instance_id,
      a.activity_type, s.attempt_number, s.version_number, s.submitted_at,
      ta.official_mark,
      row_number() over (
        partition by s.classroom_id, s.student_id, s.activity_instance_id, s.attempt_number
        order by s.version_number desc, s.submitted_at desc, s.id
      ) as version_choice
    from public.activity_submissions s
    join public.classroom_activities a
      on a.classroom_id = s.classroom_id and a.id = s.activity_instance_id
    join public.teacher_assessments ta
      on ta.classroom_id = s.classroom_id and ta.submission_id = s.id
    where s.classroom_id = p_classroom_id
      and a.activity_type in ('appreciation', 'message-remix', 'academic-transfer')
      and s.submission_kind in ('original', 'revision')
      and ta.status = 'reviewed' and ta.official_mark is not null
  ),
  latest_reviewed_version_per_attempt as (
    select * from reviewed_versions where version_choice = 1
  ),
  latest_reviewed_attempt_per_activity as (
    select v.*,
      row_number() over (
        partition by v.classroom_id, v.student_id, v.activity_instance_id
        order by v.attempt_number desc, v.submitted_at desc, v.version_number desc
      ) as attempt_choice
    from latest_reviewed_version_per_attempt v
  ),
  per_student as (
    select v.student_id,
      round(avg(v.official_mark), 2) as official_average,
      count(*) as reviewed_activity_count,
      avg(v.official_mark) filter (where v.activity_type = 'academic-transfer')
        as academic_transfer_average,
      max(v.submitted_at) as latest_qualifying_submission_at
    from latest_reviewed_attempt_per_activity v
    where v.attempt_choice = 1
    group by v.student_id
  ),
  ranked as (
    select ps.*, p.display_name,
      row_number() over (
        order by ps.official_average desc,
          ps.reviewed_activity_count desc,
          ps.academic_transfer_average desc nulls last,
          ps.latest_qualifying_submission_at asc,
          ps.student_id asc
      ) as rank_position
    from per_student ps
    join public.profiles p on p.id = ps.student_id
  )
  select r.student_id, r.display_name, r.official_average,
    r.reviewed_activity_count, r.rank_position
  from ranked r
  where public.has_classroom_staff_access(p_classroom_id) or r.rank_position <= 3
  order by r.rank_position;
end;
$$;

revoke all on function public.set_teacher_assessment(uuid, numeric, text, text) from public;
revoke all on function public.get_classroom_rankings(uuid) from public;
grant execute on function public.set_teacher_assessment(uuid, numeric, text, text) to authenticated;
grant execute on function public.get_classroom_rankings(uuid) to authenticated;

comment on table public.automated_assessments is
  'Indicative machine assessments; never an official grade or ranking source.';
comment on table public.grade_audit_events is
  'Append-only audit history for official assessment changes.';
comment on trigger guard_teacher_assessment_write on public.teacher_assessments is
  'Rejects archived inserts/updates and all deletes, including privileged direct SQL paths.';
comment on trigger grade_audit_events_immutable on public.grade_audit_events is
  'Prevents update/delete of historical grade audit events.';
comment on function public.get_classroom_rankings(uuid) is
  'Uses the latest reviewed version within each attempt and latest reviewed attempt per activity instance. Top three use deterministic tie-breaks and never exceed three students.';
