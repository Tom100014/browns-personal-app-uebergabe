begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Fail before changing privileges if this dedicated project does not match the audited schema.
do $$ declare name text; begin
  foreach name in array array['employees','employee_private','shifts','time_entries','absences','coverage_requests','coverage_offers','messages','checklists','checklist_items','settings','knowledge_docs','documents','events','revenue','extras','audit_log','push_subscriptions'] loop
    if to_regclass('public.' || name) is null then
      raise exception 'required Browns table is missing: %', name;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='employees' and column_name='auth_user_id') then
    raise exception 'required employees.auth_user_id column is missing';
  end if;
  if exists (select 1 from storage.buckets where id not in ('documents','sicknotes','knowledge')) then
    raise exception 'unreviewed storage bucket exists; audit storage policies before migration';
  end if;
  if exists (select 1 from public.time_entries where clock_out is null group by employee_id having count(*) > 1) then
    raise exception 'duplicate open time entries must be resolved before migration';
  end if;
end $$;

-- Default-deny the audited Browns tables. Newly added tables require an explicit migration.
do $$ declare name text; begin
  foreach name in array array['employees','employee_private','shifts','time_entries','absences','coverage_requests','coverage_offers','messages','checklists','checklist_items','settings','knowledge_docs','documents','events','revenue','extras','audit_log','push_subscriptions','venues','venue_tables','menu_categories','menu_items','menu_item_variants','menu_orders','menu_order_items'] loop
    if to_regclass('public.' || name) is not null then
      execute format('alter table public.%I enable row level security', name);
      execute format('alter table public.%I force row level security', name);
      execute format('revoke all on table public.%I from anon', name);
    end if;
  end loop;
end $$;

create or replace function public.app_current_employee_id() returns uuid
language sql stable security definer set search_path = pg_catalog, public set row_security = off
as $$ select id from public.employees where auth_user_id = auth.uid() limit 1 $$;

create or replace function public.app_is_manager() returns boolean
language sql stable security definer set search_path = pg_catalog, public set row_security = off
as $$ select lower(coalesce(auth.jwt()->>'email','')) = 'admin@browns.at' or exists (
  select 1 from public.employees where auth_user_id = auth.uid() and role in ('admin','manager')
) $$;

create or replace function public.app_is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public set row_security = off
as $$ select lower(coalesce(auth.jwt()->>'email','')) = 'admin@browns.at' or exists (
  select 1 from public.employees where auth_user_id = auth.uid() and role = 'admin'
) $$;

revoke all on function public.app_current_employee_id() from public, anon;
revoke all on function public.app_is_manager() from public, anon;
revoke all on function public.app_is_admin() from public, anon;
grant execute on function public.app_current_employee_id() to authenticated, service_role;
grant execute on function public.app_is_manager() to authenticated, service_role;
grant execute on function public.app_is_admin() to authenticated, service_role;

-- Distributed rate limiter. Only service-role route handlers may call it.
create table if not exists public.security_rate_limits (
  scope text not null,
  key_hash text not null,
  request_count integer not null,
  window_started_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (scope, key_hash)
);
alter table public.security_rate_limits enable row level security;
alter table public.security_rate_limits force row level security;
revoke all on public.security_rate_limits from public, anon, authenticated;
grant all on public.security_rate_limits to service_role;

create or replace function public.consume_security_rate_limit(
  p_scope text, p_key text, p_limit integer, p_window_seconds integer
) returns table(allowed boolean, remaining integer, retry_after integer)
language plpgsql security definer set search_path = pg_catalog, public set row_security = off as $$
declare current_row public.security_rate_limits%rowtype; now_at timestamptz := clock_timestamp();
begin
  if auth.role() <> 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_limit < 1 or p_window_seconds < 1 or length(p_scope) > 80 or length(p_key) > 128 then
    raise exception 'invalid rate limit';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key, 0));
  select * into current_row from public.security_rate_limits where scope = p_scope and key_hash = p_key;
  if not found or current_row.window_started_at + make_interval(secs => p_window_seconds) <= now_at then
    insert into public.security_rate_limits values (p_scope, p_key, 1, now_at, now_at)
      on conflict (scope,key_hash) do update set request_count=1, window_started_at=now_at, updated_at=now_at
      returning * into current_row;
  else
    update public.security_rate_limits set request_count=request_count+1, updated_at=now_at
      where scope=p_scope and key_hash=p_key returning * into current_row;
  end if;
  return query select current_row.request_count <= p_limit,
    greatest(0, p_limit-current_row.request_count),
    greatest(1, ceil(extract(epoch from current_row.window_started_at + make_interval(secs => p_window_seconds) - now_at))::integer);
end $$;
revoke all on function public.consume_security_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(text,text,integer,integer) to service_role;

-- One-time dispatch claims prevent replaying a verified employee chat push.
create table if not exists public.notification_dispatches (
  dedupe_key text primary key check (length(dedupe_key) between 1 and 160),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.notification_dispatches enable row level security;
alter table public.notification_dispatches force row level security;
revoke all on public.notification_dispatches from public, anon, authenticated;
grant select,insert,delete on public.notification_dispatches to service_role;

-- Authenticated users may reach tables only through the policies below.
do $$ declare name text; begin
  foreach name in array array['employees','employee_private','shifts','time_entries','absences','coverage_requests','coverage_offers','messages','checklists','checklist_items','settings','knowledge_docs','documents','events','revenue','extras','audit_log','push_subscriptions','venues','venue_tables','menu_categories','menu_items','menu_item_variants','menu_orders','menu_order_items'] loop
    if to_regclass('public.' || name) is not null then
      execute format('grant select,insert,update,delete on public.%I to authenticated', name);
    end if;
  end loop;
end $$;

-- Replace policies only on audited Browns tables. The storage preflight above protects unrelated buckets.
do $$ declare row record; begin
  for row in select schemaname, tablename, policyname from pg_policies
    where (schemaname='public' and tablename=any(array['employees','employee_private','shifts','time_entries','absences','coverage_requests','coverage_offers','messages','checklists','checklist_items','settings','knowledge_docs','documents','events','revenue','extras','audit_log','push_subscriptions','venues','venue_tables','menu_categories','menu_items','menu_item_variants','menu_orders','menu_order_items']))
       or (schemaname='storage' and tablename='objects')
  loop
    execute format('drop policy if exists %I on %I.%I', row.policyname, row.schemaname, row.tablename);
  end loop;
end $$;

create policy employees_read_manager_or_self on public.employees for select to authenticated
  using ((select public.app_is_manager()) or id=(select public.app_current_employee_id()));
create policy employees_insert_manager on public.employees for insert to authenticated with check (public.app_is_manager());
create policy employees_update_manager_or_self on public.employees for update to authenticated
  using (public.app_is_manager() or id=public.app_current_employee_id())
  with check (public.app_is_manager() or id=public.app_current_employee_id());
create policy employees_delete_manager on public.employees for delete to authenticated using (public.app_is_manager());

create policy employee_private_read on public.employee_private for select to authenticated
  using (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy employee_private_manager_write on public.employee_private for all to authenticated
  using (public.app_is_manager()) with check (public.app_is_manager());

create policy shifts_read on public.shifts for select to authenticated
  using (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy shifts_manager_write on public.shifts for all to authenticated
  using (public.app_is_manager()) with check (public.app_is_manager());
create policy shifts_self_confirm on public.shifts for update to authenticated
  using (employee_id=public.app_current_employee_id()) with check (employee_id=public.app_current_employee_id());

create or replace function public.protect_employee_shift_update() returns trigger
language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $$
begin
  if auth.role()='authenticated' and not public.app_is_manager() then
    if (to_jsonb(new)-'status') <> (to_jsonb(old)-'status') or old.status <> 'scheduled' or new.status <> 'confirmed' then
      raise exception 'employee shift update limited to confirmation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_employee_shift_update_trigger on public.shifts;
create trigger protect_employee_shift_update_trigger before update on public.shifts for each row execute function public.protect_employee_shift_update();

create policy time_entries_read on public.time_entries for select to authenticated
  using (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy time_entries_update on public.time_entries for update to authenticated
  using (public.app_is_manager() or employee_id=public.app_current_employee_id())
  with check (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy time_entries_delete_manager on public.time_entries for delete to authenticated using (public.app_is_manager());

create policy absences_read on public.absences for select to authenticated
  using (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy absences_insert_manager_or_self on public.absences for insert to authenticated
  with check (public.app_is_manager() or (employee_id=public.app_current_employee_id() and status='pending'));
create policy absences_update on public.absences for update to authenticated
  using (public.app_is_manager() or (employee_id=public.app_current_employee_id() and status='pending'))
  with check (public.app_is_manager() or (employee_id=public.app_current_employee_id() and status='pending'));
create policy absences_delete_manager on public.absences for delete to authenticated using (public.app_is_manager());

create policy coverage_requests_read on public.coverage_requests for select to authenticated
  using (public.app_is_manager() or status <> 'cancelled');
create policy coverage_requests_manager_write on public.coverage_requests for all to authenticated
  using (public.app_is_manager()) with check (public.app_is_manager());
create policy coverage_offers_read on public.coverage_offers for select to authenticated using (true);
create policy coverage_offers_insert_self on public.coverage_offers for insert to authenticated
  with check (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy coverage_offers_delete on public.coverage_offers for delete to authenticated
  using (public.app_is_manager() or employee_id=public.app_current_employee_id());

create policy messages_read on public.messages for select to authenticated using (true);
create policy messages_insert on public.messages for insert to authenticated
  with check (public.app_is_manager() or employee_id=public.app_current_employee_id());
create policy messages_delete on public.messages for delete to authenticated
  using (public.app_is_manager() or employee_id=public.app_current_employee_id());

create or replace function public.server_message_created_at() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.role()='authenticated' then new.created_at := clock_timestamp(); end if;
  return new;
end $$;
drop trigger if exists server_message_created_at_trigger on public.messages;
create trigger server_message_created_at_trigger before insert on public.messages for each row execute function public.server_message_created_at();

create policy checklists_read on public.checklists for select to authenticated using (true);
create policy checklists_manager_write on public.checklists for all to authenticated
  using (public.app_is_manager()) with check (public.app_is_manager());
create policy checklist_items_read on public.checklist_items for select to authenticated using (true);
create policy checklist_items_manager_write on public.checklist_items for all to authenticated
  using (public.app_is_manager()) with check (public.app_is_manager());
create policy checklist_items_staff_update on public.checklist_items for update to authenticated using (true) with check (true);

create or replace function public.protect_checklist_item_update() returns trigger
language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $$
begin
  if auth.role()='authenticated' and not public.app_is_manager() then
    if (to_jsonb(new)-array['done','done_by','done_at']) <> (to_jsonb(old)-array['done','done_by','done_at']) then
      raise exception 'employee checklist update limited to completion state';
    end if;
    if new.done then
      new.done_by := public.app_current_employee_id();
      new.done_at := clock_timestamp();
    else
      new.done_by := null;
      new.done_at := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_checklist_item_update_trigger on public.checklist_items;
create trigger protect_checklist_item_update_trigger before update on public.checklist_items for each row execute function public.protect_checklist_item_update();

-- Management-only data, including all unused live menu/venue tables.
do $$ declare name text; begin
  foreach name in array array['settings','knowledge_docs','documents','events','revenue','extras','venues','venue_tables','menu_categories','menu_items','menu_item_variants','menu_orders','menu_order_items'] loop
    if to_regclass('public.' || name) is not null then
      execute format('create policy %I on public.%I for all to authenticated using (public.app_is_manager()) with check (public.app_is_manager())', name || '_manager_only', name);
    end if;
  end loop;
end $$;
create policy settings_staff_wifi_read on public.settings for select to authenticated using (key='wifi_ip');
create policy audit_log_manager_read on public.audit_log for select to authenticated using (public.app_is_manager());
create policy audit_log_manager_insert on public.audit_log for insert to authenticated with check (public.app_is_manager());
-- push_subscriptions and security_rate_limits intentionally have no authenticated policy.

create or replace view public.employee_directory with (security_barrier=true, security_invoker=false) as
  select id,name,role,position,color,avatar from public.employees;
revoke all on public.employee_directory from public, anon;
grant select on public.employee_directory to authenticated, service_role;

-- Owner/auth identity columns cannot be taken over through direct authenticated writes.
create or replace function public.protect_employee_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $$
declare protected boolean; manager boolean := public.app_is_manager(); admin boolean := public.app_is_admin();
begin
  if auth.role() <> 'authenticated' then return coalesce(new,old); end if;
  if tg_op='DELETE' then
    protected := lower(old.email)='admin@browns.at' or old.id=(select value::uuid from public.settings where key='primary_admin_employee_id' and value ~* '^[0-9a-f-]{36}$' limit 1);
    if protected then
      raise exception 'protected owner cannot be deleted';
    end if;
    if not admin and lower(coalesce(old.role,'')) in ('admin','owner') then
      raise exception 'admin role deletion requires admin approval';
    end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if not admin and (new.role='admin' or new.auth_user_id is not null) then
      raise exception 'admin role and auth identity require admin approval';
    end if;
    return new;
  end if;
  protected := lower(old.email)='admin@browns.at' or old.id=(select value::uuid from public.settings where key='primary_admin_employee_id' and value ~* '^[0-9a-f-]{36}$' limit 1);
  if protected and (new.email,new.role,new.auth_user_id) is distinct from (old.email,old.role,old.auth_user_id) then
    raise exception 'protected owner identity';
  end if;
  if not admin and (new.auth_user_id is distinct from old.auth_user_id or new.role='admin' or old.role='admin') then
    raise exception 'admin role and auth identity require admin approval';
  end if;
  if not manager and (to_jsonb(new)-'notifications_enabled') <> (to_jsonb(old)-'notifications_enabled') then
    raise exception 'self update limited to notification preference';
  end if;
  return new;
end $$;
drop trigger if exists protect_employee_identity_trigger on public.employees;
create trigger protect_employee_identity_trigger before insert or update or delete on public.employees for each row execute function public.protect_employee_identity();

-- Client clock values are always replaced by the database clock.
create or replace function public.server_time_entry_clock() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare now_local timestamp := clock_timestamp() at time zone 'Europe/Berlin'; gross numeric; requested_break integer;
begin
  if auth.role()='authenticated' and tg_op='INSERT' then
    new.date := now_local::date; new.clock_in := now_local::time(0); new.clock_out := null; new.total_hours := null; new.auto_closed := false;
  elsif auth.role()='authenticated' and old.clock_out is null and new.clock_out is not null then
    requested_break := greatest(0,least(720,new.break_minutes));
    if not public.app_is_manager() then
      new.employee_id := old.employee_id;
      new.date := old.date;
      new.clock_in := old.clock_in;
      new.created_at := old.created_at;
      new.auto_closed := old.auto_closed;
    end if;
    new.clock_out := now_local::time(0);
    new.break_minutes := requested_break;
    gross := extract(epoch from (now_local - (old.date + old.clock_in))) / 3600 - requested_break / 60.0;
    new.total_hours := round(greatest(0,gross),2);
  elsif auth.role()='authenticated' and not public.app_is_manager() then
    raise exception 'employee time entry updates must use clock-out';
  end if;
  return new;
end $$;
drop trigger if exists server_time_entry_clock_trigger on public.time_entries;
create trigger server_time_entry_clock_trigger before insert or update on public.time_entries for each row execute function public.server_time_entry_clock();

create unique index if not exists time_entries_one_open_per_employee
  on public.time_entries(employee_id) where clock_out is null;
create index if not exists employees_auth_user_id_idx on public.employees(auth_user_id) where auth_user_id is not null;
create index if not exists shifts_employee_date_idx on public.shifts(employee_id,date);
create index if not exists absences_employee_dates_idx on public.absences(employee_id,start_date,end_date);
create index if not exists coverage_requests_status_date_idx on public.coverage_requests(status,date);

-- Storage: private buckets, bounded MIME types, and no anonymous object access.
update storage.buckets set public=false, file_size_limit=4194304,
  allowed_mime_types=array['application/pdf','image/png','image/jpeg','image/webp','image/heic','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/html'] where id='documents';
update storage.buckets set public=false, file_size_limit=4194304,
  allowed_mime_types=array['application/pdf','image/png','image/jpeg','image/webp','image/heic'] where id='sicknotes';
update storage.buckets set public=false, file_size_limit=4194304,
  allowed_mime_types=array['application/pdf','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/markdown','text/csv','text/tab-separated-values'] where id='knowledge';
revoke all on storage.objects from anon;
grant select,insert,update,delete on storage.objects to authenticated;
create policy storage_manager_documents on storage.objects for all to authenticated using (bucket_id='documents' and public.app_is_manager()) with check (bucket_id='documents' and public.app_is_manager());
create policy storage_manager_knowledge on storage.objects for all to authenticated using (bucket_id='knowledge' and public.app_is_manager()) with check (bucket_id='knowledge' and public.app_is_manager());
create policy storage_sicknotes_read on storage.objects for select to authenticated using (
  bucket_id='sicknotes' and (public.app_is_manager() or (storage.foldername(name))[1]=public.app_current_employee_id()::text)
);
create policy storage_sicknotes_manager_delete on storage.objects for delete to authenticated using (bucket_id='sicknotes' and public.app_is_manager());
-- Sick-note insertion has no client policy; the validated server upload endpoint owns it.

commit;
