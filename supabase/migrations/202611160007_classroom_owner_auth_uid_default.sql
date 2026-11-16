-- Let authenticated classroom inserts omit owner_teacher_id. PostgreSQL fills
-- it from the caller's JWT identity, and migration 005 still checks that the
-- row owner equals auth.uid() and the profile is an active teacher.
alter table public.classrooms
  alter column owner_teacher_id set default auth.uid();

-- Classroom owners are assigned by the database default, never by browser
-- input. The existing INSERT RLS policy remains enabled and unchanged.
revoke insert (owner_teacher_id) on public.classrooms from authenticated;
grant insert (name) on public.classrooms to authenticated;
