-- Browns Perso: minimale historische Schema-Referenz, KEIN vollständiger Neuaufbau.
-- Für ein neues System zuerst einen vollständigen Schema-Export bzw. die vollständigen
-- Basismigrationen einspielen. Erst danach die versionierte Hardening-Migration anwenden.

-- Mitarbeiter Tabelle
create table if not exists employees (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null unique,
  phone text,
  role text not null default 'employee' check (role in ('admin', 'manager', 'employee')),
  position text not null default 'Service',
  color text not null default '#f59e0b',
  avatar text,
  created_at timestamptz default now()
);

-- Schichten Tabelle
create table if not exists shifts (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  position text not null,
  note text,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'absent')),
  created_at timestamptz default now()
);

-- Zeiterfassung Tabelle
create table if not exists time_entries (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  clock_in time not null,
  clock_out time,
  break_minutes int not null default 0,
  total_hours numeric(4,2),
  created_at timestamptz default now()
);

-- Row Level Security aktivieren
alter table employees enable row level security;
alter table shifts enable row level security;
alter table time_entries enable row level security;

-- Keine permissiven Bootstrap-Policies. Nach dem Schema zwingend die versionierte
-- Migration supabase/migrations/20260718120000_security_privacy_hardening.sql anwenden.
alter table employees force row level security;
alter table shifts force row level security;
alter table time_entries force row level security;
revoke all on employees, shifts, time_entries from anon;

-- Beispiel-Daten (optional)
insert into employees (name, email, position, role, color) values
  ('Anna Bauer', 'anna@browns.at', 'Service', 'manager', '#f59e0b'),
  ('Max Huber', 'max@browns.at', 'Küche', 'employee', '#3b82f6'),
  ('Lena Müller', 'lena@browns.at', 'Bar', 'employee', '#10b981')
on conflict do nothing;
