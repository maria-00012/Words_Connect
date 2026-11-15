-- Student progress and immutable activity submission/attempt versions.
-- New writes are exposed through validation functions, not direct table DML.

create table public.activity_submissions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  activity_instance_id uuid not null,
  student_id uuid not null,
  submission_kind text not null default 'original'
    check (submission_kind in ('original', 'revision')),
  author_name_snapshot text not null check (length(trim(author_name_snapshot)) > 0),
  attempt_number integer not null check (attempt_number > 0),
  version_number integer not null default 1 check (version_number > 0),
  revision_of_submission_id uuid,
  response text not null check (length(trim(response)) > 0),
  recipient text,
  prompt_snapshot text,
  exercise_id uuid,
  exercise_title_snapshot text,
  source_submission_id uuid,
  source_author_id uuid references public.profiles(id) on delete restrict,
  source_author_name_snapshot text,
  source_text_snapshot text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (classroom_id, id),
  unique (activity_instance_id, student_id, attempt_number, version_number),
  foreign key (classroom_id, activity_instance_id)
    references public.classroom_activities(classroom_id, id) on delete restrict,
  foreign key (classroom_id, student_id)
    references public.classroom_memberships(classroom_id, student_id) on delete restrict,
  foreign key (classroom_id, revision_of_submission_id)
    references public.activity_submissions(classroom_id, id) on delete restrict,
  foreign key (classroom_id, source_submission_id)
    references public.activity_submissions(classroom_id, id) on delete restrict,
  foreign key (classroom_id, exercise_id)
    references public.academic_exercises(classroom_id, id) on delete restrict,
  check (
    (submission_kind = 'original' and revision_of_submission_id is null and version_number = 1)
    or (submission_kind = 'revision' and revision_of_submission_id is not null and version_number > 1)
  ),
  check (recipient is null or length(recipient) <= 30),
  check (prompt_snapshot is null or length(trim(prompt_snapshot)) > 0),
  check (source_author_name_snapshot is null or length(trim(source_author_name_snapshot)) > 0),
  check (source_text_snapshot is null or length(trim(source_text_snapshot)) > 0)
);

create table public.student_progress (
  classroom_id uuid not null,
  student_id uuid not null,
  current_stage smallint not null default 0 check (current_stage between 0 and 4),
  assigned_source_submission_id uuid,
  assigned_source_snapshot jsonb,
  updated_at timestamptz not null default now(),
  primary key (classroom_id, student_id),
  foreign key (classroom_id, student_id)
    references public.classroom_memberships(classroom_id, student_id) on delete restrict,
  foreign key (classroom_id, assigned_source_submission_id)
    references public.activity_submissions(classroom_id, id) on delete restrict
);

create index student_progress_classroom_stage_idx
  on public.student_progress (classroom_id, current_stage);
create index student_progress_assigned_source_idx
  on public.student_progress (assigned_source_submission_id)
  where assigned_source_submission_id is not null;

create index submissions_student_recent_idx
  on public.activity_submissions (classroom_id, student_id, submitted_at desc);
create index submissions_instance_attempt_version_idx
  on public.activity_submissions
    (activity_instance_id, student_id, attempt_number desc, version_number desc);
create index submissions_revision_parent_idx
  on public.activity_submissions (revision_of_submission_id)
  where revision_of_submission_id is not null;
create index submissions_source_message_idx
  on public.activity_submissions (source_submission_id)
  where source_submission_id is not null;
create index submissions_exercise_idx
  on public.activity_submissions (classroom_id, exercise_id)
  where exercise_id is not null;

create or replace function public.prevent_submission_rewrite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Submitted activity records are immutable; create a new attempt or revision';
end;
$$;
create trigger activity_submissions_immutable
  before update or delete on public.activity_submissions
  for each row execute function public.prevent_submission_rewrite();

-- Enforce activity-specific source snapshots, same-student revision lineage,
-- no revisions of revisions, and attempt/version sequencing.
create or replace function public.validate_activity_submission()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_expected_version integer;
  v_assignment public.academic_exercise_assignments%rowtype;
  v_source public.activity_submissions%rowtype;
  v_parent public.activity_submissions%rowtype;
  v_parent_type text;
  v_sentence_count integer;
begin
  select activity_type into v_type from public.classroom_activities
  where classroom_id = new.classroom_id and id = new.activity_instance_id;
  if not found then raise exception 'Activity instance not found'; end if;

  if new.submission_kind = 'revision' then
    if v_type <> 'academic-transfer' then
      raise exception 'Only Academic Transfer supports revisions';
    end if;
    select * into v_parent from public.activity_submissions
    where classroom_id = new.classroom_id
      and id = new.revision_of_submission_id for update;
    if not found or v_parent.submission_kind <> 'original'
       or v_parent.student_id <> new.student_id
       or v_parent.activity_instance_id <> new.activity_instance_id
       or v_parent.attempt_number <> new.attempt_number
       or new.author_name_snapshot is distinct from v_parent.author_name_snapshot
       or new.recipient is not null
       or new.source_submission_id is not null
       or new.source_author_id is not null
       or new.source_author_name_snapshot is not null
       or new.source_text_snapshot is not null then
      raise exception 'A revision must point to its own original Academic Transfer attempt';
    end if;
    select coalesce(max(version_number), 1) + 1 into v_expected_version
    from public.activity_submissions
    where revision_of_submission_id = v_parent.id;
    if new.version_number <> v_expected_version then
      raise exception 'Revision version must be the next version of its original attempt';
    end if;
    if new.prompt_snapshot is distinct from v_parent.prompt_snapshot
       or new.exercise_id is distinct from v_parent.exercise_id
       or new.exercise_title_snapshot is distinct from v_parent.exercise_title_snapshot then
      raise exception 'Revision must preserve its original prompt and exercise snapshots';
    end if;
    return new;
  end if;

  if new.attempt_number <> (
    select coalesce(max(s.attempt_number), 0) + 1
    from public.activity_submissions s
    where s.classroom_id = new.classroom_id
      and s.activity_instance_id = new.activity_instance_id
      and s.student_id = new.student_id
      and s.submission_kind = 'original'
  ) then
    raise exception 'Original attempt number must be sequential';
  end if;

  if v_type = 'appreciation' then
    if length(new.response) > 240 then raise exception 'Appreciation message exceeds 240 characters'; end if;
    select count(*) into v_sentence_count
    from unnest(regexp_split_to_array(trim(new.response), '[.!?]+')) part
    where length(trim(part)) > 0;
    if v_sentence_count > 2 then raise exception 'Appreciation message may contain at most two sentences'; end if;
    if new.prompt_snapshot is not null or new.exercise_id is not null
       or new.exercise_title_snapshot is not null or new.source_submission_id is not null
       or new.source_author_id is not null or new.source_author_name_snapshot is not null
       or new.source_text_snapshot is not null then
      raise exception 'Appreciation submissions cannot carry a source submission or academic prompt';
    end if;
  elsif v_type = 'message-remix' then
    if new.source_text_snapshot is null or new.source_author_name_snapshot is null then
      raise exception 'Message Remix requires source text and author snapshots';
    end if;
    if new.source_submission_id is not null then
      select s.* into v_source
      from public.activity_submissions s
      join public.classroom_activities a
        on a.classroom_id = s.classroom_id and a.id = s.activity_instance_id
      where s.classroom_id = new.classroom_id
        and s.id = new.source_submission_id
        and a.activity_type = 'appreciation'
        and s.submission_kind = 'original';
      if not found or v_source.student_id = new.student_id
         or v_source.response <> new.source_text_snapshot
         or v_source.student_id <> new.source_author_id
         or v_source.author_name_snapshot <> new.source_author_name_snapshot then
        raise exception 'Message Remix source must be another student’s Appreciation message';
      end if;
    elsif new.source_author_id is not null then
      raise exception 'Sample Remix sources do not have a classroom author ID';
    end if;
    if new.prompt_snapshot is not null or new.exercise_id is not null then
      raise exception 'Message Remix cannot carry an Academic Transfer prompt';
    end if;
    if new.exercise_title_snapshot is not null or new.recipient is not null then
      raise exception 'Message Remix cannot carry exercise or recipient fields';
    end if;
  elsif v_type = 'academic-transfer' then
    select * into v_assignment from public.academic_exercise_assignments
    where classroom_id = new.classroom_id and activity_instance_id = new.activity_instance_id;
    if not found or new.prompt_snapshot is distinct from v_assignment.source_sentence_snapshot
       or new.exercise_title_snapshot is distinct from v_assignment.exercise_title_snapshot
       or new.exercise_id is distinct from v_assignment.exercise_id
       or new.recipient is not null or new.source_submission_id is not null
       or new.source_author_id is not null or new.source_author_name_snapshot is not null
       or new.source_text_snapshot is not null then
      raise exception 'Academic Transfer requires the assigned exercise and its prompt snapshot';
    end if;
  else
    raise exception 'Pit Stop answers must be stored as quiz attempts, not activity submissions';
  end if;
  return new;
end;
$$;

create trigger validate_activity_submission_before_write
  before insert or update on public.activity_submissions
  for each row execute function public.validate_activity_submission();

-- Public-facing write operation. The caller supplies a source id or the
-- sample-message snapshot; prompt/exercise provenance is loaded from the DB.
create or replace function public.submit_classroom_activity(
  p_activity_instance_id uuid,
  p_response text,
  p_recipient text default null,
  p_source_submission_id uuid default null,
  p_sample_author text default null,
  p_sample_text text default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_classroom uuid;
  v_type text;
  v_wall_open boolean;
  v_submissions_open boolean;
  v_activity_status text;
  v_attempt integer;
  v_source public.activity_submissions%rowtype;
  v_assignment public.academic_exercise_assignments%rowtype;
  v_id uuid := gen_random_uuid();
  v_response text := trim(coalesce(p_response, ''));
begin
  if v_user is null or v_response = '' then
    raise exception 'Authentication and a nonempty response are required' using errcode = '22023';
  end if;
  select a.classroom_id, a.activity_type, a.status, c.wall_open, c.submissions_open
    into v_classroom, v_type, v_activity_status, v_wall_open, v_submissions_open
  from public.classroom_activities a
  join public.classrooms c on c.id = a.classroom_id
  where a.id = p_activity_instance_id and c.status = 'open';
  if not found or v_activity_status <> 'open'
     or not public.has_active_classroom_membership(v_classroom) then
    raise exception 'An open activity and active classroom membership are required' using errcode = '42501';
  end if;
  if v_type = 'pit-stop' then raise exception 'Use the quiz attempt operations for Pit Stop'; end if;
  if (v_type = 'appreciation' and not v_wall_open)
     or (v_type <> 'appreciation' and not v_submissions_open) then
    raise exception 'Classroom submissions are closed' using errcode = '42501';
  end if;

  -- Serialize each student’s attempt numbering within this classroom.
  perform 1 from public.classroom_memberships
  where classroom_id = v_classroom and student_id = v_user and status = 'active'
  for update;
  select coalesce(max(attempt_number), 0) + 1 into v_attempt
  from public.activity_submissions
  where activity_instance_id = p_activity_instance_id
    and student_id = v_user and submission_kind = 'original';

  if v_type = 'appreciation' then
    if length(v_response) > 240 or (p_recipient is not null and length(trim(p_recipient)) > 30) then
      raise exception 'Appreciation message or recipient exceeds the allowed length';
    end if;
    insert into public.activity_submissions
      (id, classroom_id, activity_instance_id, student_id, attempt_number,
       author_name_snapshot, response, recipient)
    select v_id, v_classroom, p_activity_instance_id, v_user, v_attempt,
       p.display_name, v_response, nullif(trim(p_recipient), '')
    from public.profiles p where p.id = v_user;
  elsif v_type = 'message-remix' then
    if p_source_submission_id is not null then
      select s.* into v_source
      from public.activity_submissions s
      join public.classroom_activities a
        on a.classroom_id = s.classroom_id and a.id = s.activity_instance_id
      where s.classroom_id = v_classroom and s.id = p_source_submission_id
        and a.activity_type = 'appreciation'
        and s.submission_kind = 'original';
      if not found or v_source.student_id = v_user then
        raise exception 'Source must be another student’s Appreciation message';
      end if;
      insert into public.activity_submissions
        (id, classroom_id, activity_instance_id, student_id, attempt_number,
         author_name_snapshot, response, source_submission_id, source_author_id,
         source_author_name_snapshot, source_text_snapshot)
      select v_id, v_classroom, p_activity_instance_id, v_user, v_attempt,
        p.display_name, v_response, v_source.id, v_source.student_id,
        v_source.author_name_snapshot, v_source.response
      from public.profiles p where p.id = v_user;
    else
      if nullif(trim(p_sample_author), '') is null or nullif(trim(p_sample_text), '') is null then
        raise exception 'A sample source message and author are required';
      end if;
      insert into public.activity_submissions
        (id, classroom_id, activity_instance_id, student_id, attempt_number,
         author_name_snapshot, response, source_author_name_snapshot, source_text_snapshot)
      select v_id, v_classroom, p_activity_instance_id, v_user, v_attempt,
        p.display_name, v_response, trim(p_sample_author), trim(p_sample_text)
      from public.profiles p where p.id = v_user;
    end if;
  elsif v_type = 'academic-transfer' then
    select * into v_assignment from public.academic_exercise_assignments
    where classroom_id = v_classroom and activity_instance_id = p_activity_instance_id;
    if not found then raise exception 'Academic exercise is not assigned'; end if;
    insert into public.activity_submissions
      (id, classroom_id, activity_instance_id, student_id, attempt_number,
       author_name_snapshot, response, prompt_snapshot, exercise_id, exercise_title_snapshot)
    select v_id, v_classroom, p_activity_instance_id, v_user, v_attempt,
      p.display_name, v_response, v_assignment.source_sentence_snapshot,
      v_assignment.exercise_id, v_assignment.exercise_title_snapshot
    from public.profiles p where p.id = v_user;
  end if;
  return v_id;
end;
$$;

create or replace function public.submit_academic_revision(
  p_original_submission_id uuid,
  p_response text
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.activity_submissions%rowtype;
  v_activity_status text;
  v_classroom_status text;
  v_submissions_open boolean;
  v_version integer;
  v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or nullif(trim(p_response), '') is null then
    raise exception 'Authentication and a nonempty revision are required' using errcode = '22023';
  end if;
  -- Serialize revision numbering for this original attempt.
  select * into v_original from public.activity_submissions
  where id = p_original_submission_id and student_id = auth.uid()
    and submission_kind = 'original'
  for update;
  if not found then raise exception 'Original submission not found' using errcode = '42501'; end if;
  select a.status, c.status, c.submissions_open
    into v_activity_status, v_classroom_status, v_submissions_open
  from public.classroom_activities a
  join public.classrooms c on c.id = a.classroom_id
  where a.id = v_original.activity_instance_id
    and a.classroom_id = v_original.classroom_id
    and a.activity_type = 'academic-transfer';
  if not found or v_activity_status <> 'open' or v_classroom_status <> 'open'
     or not v_submissions_open
     or not public.has_active_classroom_membership(v_original.classroom_id) then
    raise exception 'An open Academic Transfer and active membership are required' using errcode = '42501';
  end if;
  select coalesce(max(version_number), 1) + 1 into v_version
  from public.activity_submissions where revision_of_submission_id = v_original.id;
  insert into public.activity_submissions
    (id, classroom_id, activity_instance_id, student_id, submission_kind,
     attempt_number, version_number, revision_of_submission_id, author_name_snapshot, response,
     prompt_snapshot, exercise_id, exercise_title_snapshot)
  values
    (v_id, v_original.classroom_id, v_original.activity_instance_id,
     v_original.student_id, 'revision', v_original.attempt_number, v_version,
     v_original.id, v_original.author_name_snapshot, trim(p_response), v_original.prompt_snapshot,
     v_original.exercise_id, v_original.exercise_title_snapshot);
  return v_id;
end;
$$;

create or replace function public.set_student_stage(p_classroom_id uuid, p_stage smallint)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_stage not between 0 and 4 then raise exception 'Stage must be between 0 and 4'; end if;
  if auth.uid() is null or not public.has_active_classroom_membership(p_classroom_id)
     or not exists (select 1 from public.classrooms c where c.id = p_classroom_id and c.status = 'open') then
    raise exception 'Active membership in an open classroom is required' using errcode = '42501';
  end if;
  insert into public.student_progress (classroom_id, student_id, current_stage)
  values (p_classroom_id, auth.uid(), p_stage)
  on conflict (classroom_id, student_id) do update
    set current_stage = excluded.current_stage, updated_at = now();
end;
$$;

create or replace function public.set_remix_assignment(
  p_classroom_id uuid,
  p_source_submission_id uuid default null,
  p_sample_author text default null,
  p_sample_text text default null
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_author uuid;
begin
  if auth.uid() is null or not public.has_active_classroom_membership(p_classroom_id)
     or not exists (select 1 from public.classrooms c
       where c.id = p_classroom_id and c.status = 'open') then
    raise exception 'Active membership in an open classroom is required' using errcode = '42501';
  end if;
  if p_source_submission_id is not null then
    select s.student_id, jsonb_build_object(
      'submissionId', s.id, 'authorId', s.student_id,
      'author', s.author_name_snapshot, 'text', s.response
    ) into v_author, v_snapshot
    from public.activity_submissions s
    join public.classroom_activities a
      on a.classroom_id = s.classroom_id and a.id = s.activity_instance_id
    where s.classroom_id = p_classroom_id and s.id = p_source_submission_id
      and s.submission_kind = 'original' and a.activity_type = 'appreciation';
    if not found or v_author = auth.uid() then
      raise exception 'Remix source must be another student’s Appreciation message';
    end if;
  else
    if nullif(trim(p_sample_author), '') is null or nullif(trim(p_sample_text), '') is null then
      raise exception 'Sample source author and text are required';
    end if;
    v_snapshot := jsonb_build_object(
      'submissionId', null, 'authorId', null,
      'author', trim(p_sample_author), 'text', trim(p_sample_text)
    );
  end if;
  insert into public.student_progress
    (classroom_id, student_id, assigned_source_submission_id,
     assigned_source_snapshot, updated_at)
  values (p_classroom_id, auth.uid(), p_source_submission_id, v_snapshot, now())
  on conflict (classroom_id, student_id) do update
    set assigned_source_submission_id = excluded.assigned_source_submission_id,
        assigned_source_snapshot = excluded.assigned_source_snapshot,
        updated_at = now();
end;
$$;

revoke all on function public.submit_classroom_activity(uuid, text, text, uuid, text, text) from public;
revoke all on function public.submit_academic_revision(uuid, text) from public;
revoke all on function public.set_student_stage(uuid, smallint) from public;
revoke all on function public.set_remix_assignment(uuid, uuid, text, text) from public;
grant execute on function public.submit_classroom_activity(uuid, text, text, uuid, text, text) to authenticated;
grant execute on function public.submit_academic_revision(uuid, text) to authenticated;
grant execute on function public.set_student_stage(uuid, smallint) to authenticated;
grant execute on function public.set_remix_assignment(uuid, uuid, text, text) to authenticated;

comment on table public.activity_submissions is
  'Original attempts and immutable revision versions. All records are tied to one classroom activity instance.';
