-- Direct INSERT remains protected by the classrooms RLS policy. This narrow
-- RPC handles classroom creation after explicitly checking the authenticated
-- profile, then assigns ownership from auth.uid() on the database server.
create or replace function public.create_classroom(p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_classroom_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'teacher' and p.status = 'active'
  ) then
    raise exception 'An active teacher account is required to create a classroom'
      using errcode = '42501';
  end if;

  if v_name is null or length(v_name) > 120 then
    raise exception 'Classroom name must contain between 1 and 120 characters'
      using errcode = '22023';
  end if;

  insert into public.classrooms (owner_teacher_id, name)
  values (v_user_id, v_name)
  returning id into v_classroom_id;

  return v_classroom_id;
end;
$$;

revoke all on function public.create_classroom(text) from public, anon;
grant execute on function public.create_classroom(text) to authenticated;
