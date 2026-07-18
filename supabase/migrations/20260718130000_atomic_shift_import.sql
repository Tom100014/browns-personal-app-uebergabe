create table if not exists public.shift_import_runs (
  id uuid primary key,
  actor_user_id uuid not null,
  shift_ids uuid[] not null default array[]::uuid[],
  employee_ids uuid[] not null default array[]::uuid[],
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.shift_import_runs enable row level security;
revoke all on table public.shift_import_runs from anon, authenticated;

create unique index if not exists shifts_exact_assignment_unique
  on public.shifts (employee_id, date, start_time, end_time, lower(position))
  where employee_id is not null and status <> 'absent';

create or replace function public.import_shifts_with_profiles(
  p_import_id uuid,
  p_actor text,
  p_actor_user_id uuid,
  p_profiles jsonb,
  p_shifts jsonb
)
returns table (
  shift_ids uuid[],
  created_employee_ids uuid[],
  duplicate_count integer,
  reused boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift_ids uuid[] := array[]::uuid[];
  v_employee_ids uuid[] := array[]::uuid[];
  v_duplicate_count integer := 0;
  v_existing_actor uuid;
begin
  select run.actor_user_id
    into v_existing_actor
    from public.shift_import_runs as run
   where run.id = p_import_id;

  if found then
    if v_existing_actor <> p_actor_user_id then
      raise exception 'Import-ID gehört zu einem anderen Benutzer';
    end if;
    return query
      select run.shift_ids, run.employee_ids, run.duplicate_count, true
        from public.shift_import_runs as run
       where run.id = p_import_id;
    return;
  end if;

  if jsonb_typeof(p_profiles) <> 'array' or jsonb_typeof(p_shifts) <> 'array' or jsonb_array_length(p_shifts) = 0 then
    raise exception 'Ungültige Importdaten';
  end if;

  insert into public.employees (id, name, email, role, position, color, employment_type, auth_user_id, created_at)
  select
    (profile->>'id')::uuid,
    profile->>'name',
    profile->>'email',
    'employee',
    profile->>'position',
    profile->>'color',
    profile->>'employmentType',
    null,
    now()
  from jsonb_array_elements(p_profiles) as profile;

  select coalesce(array_agg((profile->>'id')::uuid), array[]::uuid[])
    into v_employee_ids
    from jsonb_array_elements(p_profiles) as profile;

  with candidates as (
    select distinct on (
      (shift->>'employeeId')::uuid,
      (shift->>'date')::date,
      (shift->>'start')::time,
      (shift->>'end')::time,
      lower(shift->>'position')
    )
      (shift->>'id')::uuid as id,
      (shift->>'employeeId')::uuid as employee_id,
      (shift->>'date')::date as shift_date,
      (shift->>'start')::time as start_time,
      (shift->>'end')::time as end_time,
      shift->>'position' as position,
      nullif(shift->>'note', '') as note
    from jsonb_array_elements(p_shifts) as shift
    order by
      (shift->>'employeeId')::uuid,
      (shift->>'date')::date,
      (shift->>'start')::time,
      (shift->>'end')::time,
      lower(shift->>'position'),
      (shift->>'id')::uuid
  ), inserted as (
    insert into public.shifts (id, employee_id, date, start_time, end_time, position, note, status, created_at)
    select candidate.id, candidate.employee_id, candidate.shift_date, candidate.start_time,
      candidate.end_time, candidate.position, candidate.note, 'scheduled', now()
    from candidates as candidate
    where not exists (
      select 1
      from public.shifts as existing
      where existing.employee_id = candidate.employee_id
        and existing.date = candidate.shift_date
        and existing.start_time = candidate.start_time
        and existing.end_time = candidate.end_time
        and lower(existing.position) = lower(candidate.position)
    )
    on conflict do nothing
    returning id
  )
  select coalesce(array_agg(inserted.id), array[]::uuid[])
    into v_shift_ids
    from inserted;

  v_duplicate_count := jsonb_array_length(p_shifts) - cardinality(v_shift_ids);

  insert into public.audit_log (actor, action, detail)
  values (
    left(coalesce(p_actor, p_actor_user_id::text), 160),
    'Dienstplanimport abgeschlossen',
    left(jsonb_build_object(
      'actorUserId', p_actor_user_id,
      'importId', p_import_id,
      'createdProfiles', cardinality(v_employee_ids),
      'insertedShifts', cardinality(v_shift_ids),
      'duplicates', v_duplicate_count
    )::text, 4000)
  );

  insert into public.shift_import_runs (id, actor_user_id, shift_ids, employee_ids, duplicate_count)
  values (p_import_id, p_actor_user_id, v_shift_ids, v_employee_ids, v_duplicate_count);

  return query select v_shift_ids, v_employee_ids, v_duplicate_count, false;
end;
$$;

revoke all on function public.import_shifts_with_profiles(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_shifts_with_profiles(uuid, text, uuid, jsonb, jsonb) to service_role;
