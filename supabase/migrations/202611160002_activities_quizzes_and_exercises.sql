-- Classroom activity instances, immutable quiz versions/attempt snapshots,
-- and versioned academic exercises. Published content is preserved for history.

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (classroom_id, id)
);

create table public.quiz_versions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  quiz_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (quiz_id, version_number),
  unique (classroom_id, id),
  foreign key (classroom_id, quiz_id)
    references public.quizzes(classroom_id, id) on delete restrict,
  check ((status = 'draft') = (published_at is null))
);

create or replace function public.validate_quiz_version_sequence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_expected integer;
begin
  if tg_op = 'INSERT' then
    select coalesce(max(version_number), 0) + 1 into v_expected
    from public.quiz_versions where classroom_id = new.classroom_id and quiz_id = new.quiz_id;
    if new.version_number <> v_expected then
      raise exception 'Quiz version numbers must be sequential';
    end if;
  else
    if old.status = 'retired' or
       (old.status <> 'draft' and
        (new.status not in (old.status, 'retired') or
         new.quiz_id is distinct from old.quiz_id or
         new.classroom_id is distinct from old.classroom_id or
         new.version_number is distinct from old.version_number or
         new.created_by is distinct from old.created_by or
         new.published_at is distinct from old.published_at)) then
      raise exception 'Published quiz versions are immutable; create a new version';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_quiz_version_immutability
  before insert or update on public.quiz_versions
  for each row execute function public.validate_quiz_version_sequence();

create index quiz_versions_classroom_status_idx
  on public.quiz_versions (classroom_id, status);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  quiz_version_id uuid not null,
  position integer not null check (position >= 0),
  title text not null check (length(trim(title)) between 1 and 160),
  prompt text not null check (length(trim(prompt)) between 1 and 4000),
  options jsonb not null,
  feedback jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (quiz_version_id, position),
  unique (classroom_id, id),
  foreign key (classroom_id, quiz_version_id)
    references public.quiz_versions(classroom_id, id) on delete restrict,
  check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  check (jsonb_typeof(feedback) = 'array')
);

create index quiz_questions_version_position_idx
  on public.quiz_questions (quiz_version_id, position);

create or replace function public.validate_quiz_question_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.options) option_value
    where jsonb_typeof(option_value) <> 'string'
      or length(trim(option_value #>> '{}')) = 0
  ) then raise exception 'Quiz options must be nonempty strings'; end if;
  if exists (
    select 1 from jsonb_array_elements(new.feedback) feedback_value
    where jsonb_typeof(feedback_value) <> 'string'
  ) then raise exception 'Quiz feedback entries must be strings'; end if;
  return new;
end;
$$;
create trigger validate_quiz_question_json
  before insert or update on public.quiz_questions
  for each row execute function public.validate_quiz_question_content();

create table public.quiz_answer_keys (
  classroom_id uuid not null,
  question_id uuid primary key,
  correct_option_index smallint not null check (correct_option_index >= 0),
  foreign key (classroom_id, question_id)
    references public.quiz_questions(classroom_id, id) on delete restrict
);

-- The answer key is intentionally separate from student-readable question data.
create table public.academic_exercises (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  exercise_family_id uuid not null default gen_random_uuid(),
  version_number integer not null check (version_number > 0),
  title text not null check (length(trim(title)) between 1 and 160),
  source_sentence text not null check (length(trim(source_sentence)) between 1 and 10000),
  status text not null default 'active' check (status in ('active', 'retired')),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (classroom_id, exercise_family_id, version_number),
  unique (classroom_id, id)
);

create index academic_exercises_classroom_status_idx
  on public.academic_exercises (classroom_id, status);

create or replace function public.validate_academic_exercise_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_expected integer;
begin
  if tg_op = 'INSERT' then
    select coalesce(max(version_number), 0) + 1 into v_expected
    from public.academic_exercises
    where classroom_id = new.classroom_id and exercise_family_id = new.exercise_family_id;
    if new.version_number <> v_expected then
      raise exception 'Exercise versions must be sequential within the classroom';
    end if;
  elsif new.classroom_id is distinct from old.classroom_id
     or new.exercise_family_id is distinct from old.exercise_family_id
     or new.version_number is distinct from old.version_number
     or new.title is distinct from old.title
     or new.source_sentence is distinct from old.source_sentence
     or new.created_by is distinct from old.created_by then
    raise exception 'Exercise versions are immutable; create a new version';
  end if;
  return new;
end;
$$;
create trigger validate_academic_exercise_versions
  before insert or update on public.academic_exercises
  for each row execute function public.validate_academic_exercise_version();

create table public.classroom_activities (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  activity_type text not null check (
    activity_type in ('appreciation', 'message-remix', 'academic-transfer', 'pit-stop')
  ),
  title text not null check (length(trim(title)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'retired')),
  position integer not null default 0,
  prompt_snapshot text,
  quiz_version_id uuid,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, id),
  foreign key (classroom_id, quiz_version_id)
    references public.quiz_versions(classroom_id, id) on delete restrict,
  check (
    (activity_type = 'pit-stop' and quiz_version_id is not null)
    or (activity_type <> 'pit-stop' and quiz_version_id is null)
  )
);

create index classroom_activities_classroom_status_position_idx
  on public.classroom_activities (classroom_id, status, position);
create index classroom_activities_quiz_version_idx
  on public.classroom_activities (classroom_id, quiz_version_id)
  where quiz_version_id is not null;

create or replace function public.validate_pit_stop_quiz_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_quiz_status text;
begin
  if new.activity_type = 'pit-stop' then
    select status into v_quiz_status from public.quiz_versions
    where classroom_id = new.classroom_id and id = new.quiz_version_id;
    if not found or v_quiz_status <> 'published' then
      raise exception 'Pit Stop activities must reference a published quiz version';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_activity_quiz_version
  before insert or update of activity_type, classroom_id, quiz_version_id
  on public.classroom_activities
  for each row execute function public.validate_pit_stop_quiz_version();

-- Exactly one persistent Appreciation Wall instance per classroom, including
-- retired rows. Reopen/reactivate this instance instead of creating another.
create unique index classroom_activities_one_appreciation_per_classroom_uidx
  on public.classroom_activities (classroom_id)
  where activity_type = 'appreciation';

create table public.academic_exercise_assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  activity_instance_id uuid not null unique,
  exercise_id uuid not null,
  source_sentence_snapshot text not null,
  exercise_title_snapshot text not null,
  assigned_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique (classroom_id, id),
  foreign key (classroom_id, activity_instance_id)
    references public.classroom_activities(classroom_id, id) on delete restrict,
  foreign key (classroom_id, exercise_id)
    references public.academic_exercises(classroom_id, id) on delete restrict,
  check (length(trim(source_sentence_snapshot)) > 0),
  check (length(trim(exercise_title_snapshot)) > 0)
);

create index exercise_assignments_exercise_idx
  on public.academic_exercise_assignments (classroom_id, exercise_id);

create or replace function public.validate_classroom_activity_links()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_activity_type text;
begin
  select activity_type into v_activity_type
  from public.classroom_activities
  where classroom_id = new.classroom_id and id = new.activity_instance_id;
  if not found or v_activity_type <> 'academic-transfer' then
    raise exception 'Exercise assignments require an Academic Transfer activity';
  end if;
  return new;
end;
$$;

create trigger validate_exercise_assignment_activity
  before insert or update on public.academic_exercise_assignments
  for each row execute function public.validate_classroom_activity_links();

create or replace function public.validate_academic_exercise_assignment_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source text;
  v_title text;
begin
  select source_sentence, title into v_source, v_title
  from public.academic_exercises
  where classroom_id = new.classroom_id and id = new.exercise_id;
  if not found or new.source_sentence_snapshot is distinct from v_source
     or new.exercise_title_snapshot is distinct from v_title then
    raise exception 'Assignment must snapshot the selected academic exercise version';
  end if;
  return new;
end;
$$;
create trigger validate_exercise_assignment_snapshot
  before insert or update on public.academic_exercise_assignments
  for each row execute function public.validate_academic_exercise_assignment_snapshot();

create or replace function public.validate_quiz_answer_key_index()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_options jsonb;
begin
  select options into v_options from public.quiz_questions
  where classroom_id = new.classroom_id and id = new.question_id;
  if not found or new.correct_option_index >= jsonb_array_length(v_options) then
    raise exception 'Correct option index is outside the question options';
  end if;
  return new;
end;
$$;

create trigger validate_quiz_answer_key
  before insert or update on public.quiz_answer_keys
  for each row execute function public.validate_quiz_answer_key_index();

create or replace function public.prevent_published_quiz_content_edits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_version_id uuid;
  v_classroom_id uuid;
  v_status text;
  v_old_version_id uuid;
  v_old_classroom_id uuid;
  v_old_status text;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'quiz_questions' then
      v_old_version_id := old.quiz_version_id;
      v_old_classroom_id := old.classroom_id;
    else
      v_old_classroom_id := old.classroom_id;
      select q.quiz_version_id into v_old_version_id
      from public.quiz_questions q
      where q.classroom_id = old.classroom_id and q.id = old.question_id;
    end if;
    select status into v_old_status from public.quiz_versions
    where classroom_id = v_old_classroom_id and id = v_old_version_id;
    if v_old_status is distinct from 'draft' then
      raise exception 'Published or retired quiz content is immutable; create a new version';
    end if;
  end if;

  if tg_op = 'DELETE' then
    if tg_table_name = 'quiz_questions' then
      v_version_id := old.quiz_version_id;
      v_classroom_id := old.classroom_id;
    else
      v_classroom_id := old.classroom_id;
      select q.quiz_version_id into v_version_id from public.quiz_questions q
      where q.classroom_id = old.classroom_id and q.id = old.question_id;
    end if;
  else
    if tg_table_name = 'quiz_questions' then
      v_version_id := new.quiz_version_id;
      v_classroom_id := new.classroom_id;
    else
      v_classroom_id := new.classroom_id;
      select q.quiz_version_id into v_version_id from public.quiz_questions q
      where q.classroom_id = new.classroom_id and q.id = new.question_id;
    end if;
  end if;
  select status into v_status from public.quiz_versions
  where classroom_id = v_classroom_id and id = v_version_id;
  if v_status is distinct from 'draft' then
    raise exception 'Published or retired quiz content is immutable; create a new version';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger freeze_non_draft_question_content
  before update or delete on public.quiz_questions
  for each row execute function public.prevent_published_quiz_content_edits();
create trigger freeze_non_draft_answer_keys
  before update or delete on public.quiz_answer_keys
  for each row execute function public.prevent_published_quiz_content_edits();

create or replace function public.publish_quiz_version(p_quiz_version_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_classroom uuid;
  v_status text;
  v_question_count integer;
  v_key_count integer;
begin
  select classroom_id, status into v_classroom, v_status
  from public.quiz_versions where id = p_quiz_version_id for update;
  if not found or not public.can_manage_classroom(v_classroom)
     or not exists (select 1 from public.classrooms c
       where c.id = v_classroom and c.status = 'open') then
    raise exception 'Classroom manager permission required' using errcode = '42501';
  end if;
  if v_status <> 'draft' then raise exception 'Only a draft quiz version can be published'; end if;
  select count(*) into v_question_count from public.quiz_questions
  where classroom_id = v_classroom and quiz_version_id = p_quiz_version_id;
  select count(*) into v_key_count from public.quiz_answer_keys k
  join public.quiz_questions q on q.classroom_id = k.classroom_id and q.id = k.question_id
  where q.classroom_id = v_classroom and q.quiz_version_id = p_quiz_version_id;
  if v_question_count = 0 or v_key_count <> v_question_count then
    raise exception 'Every quiz question requires one valid protected answer key';
  end if;
  if exists (
    select 1 from public.quiz_answer_keys k
    join public.quiz_questions q
      on q.classroom_id = k.classroom_id and q.id = k.question_id
    where q.classroom_id = v_classroom and q.quiz_version_id = p_quiz_version_id
      and k.correct_option_index >= jsonb_array_length(q.options)
  ) then
    raise exception 'A protected answer key points outside its question options';
  end if;
  update public.quiz_versions
  set status = 'published', published_at = now()
  where id = p_quiz_version_id;
end;
$$;
revoke all on function public.publish_quiz_version(uuid) from public;
grant execute on function public.publish_quiz_version(uuid) to authenticated;

create or replace function public.retire_quiz_version(p_quiz_version_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_classroom uuid;
begin
  select classroom_id into v_classroom from public.quiz_versions
  where id = p_quiz_version_id for update;
  if not found or not public.can_manage_classroom(v_classroom)
     or not exists (select 1 from public.classrooms c
       where c.id = v_classroom and c.status = 'open') then
    raise exception 'Classroom manager permission required' using errcode = '42501';
  end if;
  if exists (select 1 from public.classroom_activities a
    where a.classroom_id = v_classroom and a.quiz_version_id = p_quiz_version_id
      and a.status = 'open') then
    raise exception 'Reassign or close active Pit Stop activities before retiring this version';
  end if;
  update public.quiz_versions set status = 'retired'
  where id = p_quiz_version_id and status = 'published';
  if not found then raise exception 'Only a published version can be retired'; end if;
end;
$$;
revoke all on function public.retire_quiz_version(uuid) from public;
grant execute on function public.retire_quiz_version(uuid) to authenticated;

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  student_id uuid not null,
  activity_instance_id uuid not null,
  quiz_version_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  score integer check (score >= 0),
  total integer not null check (total >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (activity_instance_id, student_id, attempt_number),
  unique (classroom_id, id),
  foreign key (classroom_id, student_id)
    references public.classroom_memberships(classroom_id, student_id) on delete restrict,
  foreign key (classroom_id, activity_instance_id)
    references public.classroom_activities(classroom_id, id) on delete restrict,
  foreign key (classroom_id, quiz_version_id)
    references public.quiz_versions(classroom_id, id) on delete restrict,
  check (score is null or score <= total),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'in_progress' and score is null) or status = 'completed')
);

create index quiz_attempts_student_recent_idx
  on public.quiz_attempts (classroom_id, student_id, completed_at desc);
create index quiz_attempts_classroom_status_idx
  on public.quiz_attempts (classroom_id, status, completed_at desc);

create or replace function public.validate_quiz_attempt_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_activity public.classroom_activities%rowtype;
begin
  select * into v_activity from public.classroom_activities
  where classroom_id = new.classroom_id and id = new.activity_instance_id;
  if not found or v_activity.activity_type <> 'pit-stop'
     or v_activity.quiz_version_id <> new.quiz_version_id then
    raise exception 'Quiz attempt version must match its classroom Pit Stop activity';
  end if;
  return new;
end;
$$;
create trigger validate_quiz_attempt_activity
  before insert or update on public.quiz_attempts
  for each row execute function public.validate_quiz_attempt_activity();

create table public.quiz_attempt_items (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  attempt_id uuid not null,
  question_id uuid not null,
  position integer not null check (position >= 0),
  question_snapshot jsonb not null,
  selected_option_index smallint,
  is_correct boolean,
  unique (attempt_id, position),
  unique (attempt_id, question_id),
  foreign key (classroom_id, attempt_id)
    references public.quiz_attempts(classroom_id, id) on delete restrict,
  foreign key (classroom_id, question_id)
    references public.quiz_questions(classroom_id, id) on delete restrict,
  check (selected_option_index is null or selected_option_index >= 0),
  check ((selected_option_index is null) = (is_correct is null))
);

create index quiz_attempt_items_attempt_position_idx
  on public.quiz_attempt_items (attempt_id, position);

create or replace function public.validate_quiz_attempt_item_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_question public.quiz_questions%rowtype;
  v_attempt public.quiz_attempts%rowtype;
  v_expected jsonb;
begin
  select * into v_attempt from public.quiz_attempts
  where classroom_id = new.classroom_id and id = new.attempt_id;
  select * into v_question from public.quiz_questions
  where classroom_id = new.classroom_id and id = new.question_id;
  if not found or v_question.quiz_version_id <> v_attempt.quiz_version_id then
    raise exception 'Attempt item question must belong to the attempt quiz version';
  end if;
  v_expected := jsonb_build_object(
    'title', v_question.title, 'prompt', v_question.prompt,
    'options', v_question.options, 'feedback', v_question.feedback
  );
  if new.question_snapshot is distinct from v_expected then
    raise exception 'Attempt item must preserve the presented question snapshot';
  end if;
  if new.selected_option_index is not null and
     new.selected_option_index >= jsonb_array_length(new.question_snapshot -> 'options') then
    raise exception 'Selected option is outside the saved question snapshot';
  end if;
  if tg_op = 'UPDATE' and (
    new.classroom_id is distinct from old.classroom_id
    or new.attempt_id is distinct from old.attempt_id
    or new.question_id is distinct from old.question_id
    or new.position is distinct from old.position
    or new.question_snapshot is distinct from old.question_snapshot
  ) then
    raise exception 'Quiz attempt question snapshots are immutable';
  end if;
  return new;
end;
$$;
create trigger validate_quiz_attempt_item_snapshot
  before insert or update on public.quiz_attempt_items
  for each row execute function public.validate_quiz_attempt_item_snapshot();

create or replace function public.start_quiz_attempt(p_activity_instance_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_classroom uuid;
  v_quiz_version uuid;
  v_attempt_number integer;
  v_attempt_id uuid := gen_random_uuid();
  v_total integer;
begin
  select a.classroom_id, a.quiz_version_id into v_classroom, v_quiz_version
  from public.classroom_activities a
  join public.classrooms c on c.id = a.classroom_id
  join public.quiz_versions qv
    on qv.classroom_id = a.classroom_id and qv.id = a.quiz_version_id
  where a.id = p_activity_instance_id
    and a.activity_type = 'pit-stop' and a.status = 'open'
    and c.status = 'open' and qv.status = 'published';
  if not found or not public.has_active_classroom_membership(v_classroom) then
    raise exception 'Active classroom membership and an open Pit Stop are required'
      using errcode = '42501';
  end if;

  -- Lock the membership to serialize attempt-number allocation for this student.
  perform 1 from public.classroom_memberships
  where classroom_id = v_classroom and student_id = v_user and status = 'active'
  for update;
  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from public.quiz_attempts
  where activity_instance_id = p_activity_instance_id and student_id = v_user;
  select count(*) into v_total from public.quiz_questions
  where classroom_id = v_classroom
    and quiz_version_id = v_quiz_version;
  if v_total = 0 then raise exception 'Published quiz has no questions'; end if;

  insert into public.quiz_attempts
    (id, classroom_id, student_id, activity_instance_id, quiz_version_id,
     attempt_number, total)
  values
    (v_attempt_id, v_classroom, v_user, p_activity_instance_id,
     v_quiz_version, v_attempt_number, v_total);

  insert into public.quiz_attempt_items
    (classroom_id, attempt_id, question_id, position, question_snapshot)
  select q.classroom_id, v_attempt_id, q.id, q.position,
    jsonb_build_object(
      'title', q.title, 'prompt', q.prompt,
      'options', q.options, 'feedback', q.feedback
    )
  from public.quiz_questions q
  where q.classroom_id = v_classroom and q.quiz_version_id = v_quiz_version
  order by q.position;
  return v_attempt_id;
end;
$$;

create or replace function public.save_quiz_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_index smallint
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_correct_index smallint;
  v_classroom uuid;
  v_options jsonb;
  v_feedback jsonb;
  v_correct boolean;
begin
  if p_selected_option_index is null then
    raise exception 'Selected option is required' using errcode = '22023';
  end if;
  select a.classroom_id, (i.question_snapshot -> 'options'),
         (i.question_snapshot -> 'feedback')
    into v_classroom, v_options, v_feedback
  from public.quiz_attempts a
  join public.quiz_attempt_items i
    on i.classroom_id = a.classroom_id and i.attempt_id = a.id
  join public.classroom_activities ca
    on ca.classroom_id = a.classroom_id and ca.id = a.activity_instance_id
  join public.classrooms c on c.id = a.classroom_id
  where a.id = p_attempt_id and a.student_id = auth.uid()
    and i.question_id = p_question_id and a.status = 'in_progress'
    and ca.status = 'open' and c.status = 'open'
  for update of a, i;
  if not found or not public.has_active_classroom_membership(v_classroom) then
    raise exception 'Attempt is unavailable or no longer writable' using errcode = '42501';
  end if;
  if p_selected_option_index < 0
    or p_selected_option_index >= jsonb_array_length(v_options) then
    raise exception 'Selected option is invalid' using errcode = '22023';
  end if;

  select k.correct_option_index into v_correct_index
  from public.quiz_attempts a
  join public.quiz_answer_keys k on k.classroom_id = a.classroom_id
  join public.quiz_questions q on q.classroom_id = k.classroom_id and q.id = k.question_id
  where a.id = p_attempt_id and q.id = p_question_id;
  v_correct := p_selected_option_index = v_correct_index;
  update public.quiz_attempt_items
  set selected_option_index = p_selected_option_index, is_correct = v_correct
  where attempt_id = p_attempt_id and question_id = p_question_id;
  -- Reveal only the answered item's feedback/key, matching the current Pit Stop
  -- behavior; the answer-key table and other questions remain protected.
  return jsonb_build_object(
    'is_correct', v_correct,
    'correct_option_index', v_correct_index,
    'correct_option', v_options -> v_correct_index,
    'feedback', v_feedback -> p_selected_option_index
  );
end;
$$;

create or replace function public.complete_quiz_attempt(p_attempt_id uuid)
returns table (score integer, total integer)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_classroom uuid;
  v_score integer;
  v_total integer;
begin
  select a.classroom_id into v_classroom
  from public.quiz_attempts a
  join public.classroom_activities ca
    on ca.classroom_id = a.classroom_id and ca.id = a.activity_instance_id
  join public.classrooms c on c.id = a.classroom_id
  where a.id = p_attempt_id and a.student_id = auth.uid()
    and a.status = 'in_progress' and ca.status = 'open' and c.status = 'open'
  for update;
  if not found or not public.has_active_classroom_membership(v_classroom) then
    raise exception 'Attempt is unavailable or no longer writable' using errcode = '42501';
  end if;
  select count(*) filter (where i.is_correct), count(*)
    into v_score, v_total
  from public.quiz_attempt_items i where i.attempt_id = p_attempt_id;
  if v_total = 0 or exists (
    select 1 from public.quiz_attempt_items i
    where i.attempt_id = p_attempt_id and i.selected_option_index is null
  ) then
    raise exception 'Answer every question before completing the attempt' using errcode = '22023';
  end if;
  update public.quiz_attempts
  set status = 'completed', score = v_score, total = v_total, completed_at = now()
  where id = p_attempt_id;
  return query select v_score, v_total;
end;
$$;

revoke all on function public.start_quiz_attempt(uuid) from public;
revoke all on function public.save_quiz_attempt_answer(uuid, uuid, smallint) from public;
revoke all on function public.complete_quiz_attempt(uuid) from public;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;
grant execute on function public.save_quiz_attempt_answer(uuid, uuid, smallint) to authenticated;
grant execute on function public.complete_quiz_attempt(uuid) to authenticated;

comment on table public.classroom_activities is
  'An individual assigned activity instance. Every classroom has at most one persistent Appreciation Wall instance.';
comment on table public.quiz_attempt_items is
  'Immutable presented-question snapshot; answer keys remain in a separate protected table.';
