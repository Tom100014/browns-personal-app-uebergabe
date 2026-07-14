-- Browns Perso Datenbank Schema
-- Führe dieses SQL in deinem Supabase SQL Editor aus

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

-- Policies: alle eingeloggten Nutzer dürfen alles lesen/schreiben
create policy "auth users can do everything on employees"
  on employees for all to authenticated using (true) with check (true);

create policy "auth users can do everything on shifts"
  on shifts for all to authenticated using (true) with check (true);

create policy "auth users can do everything on time_entries"
  on time_entries for all to authenticated using (true) with check (true);

-- Beispiel-Daten (optional)
insert into employees (name, email, position, role, color) values
  ('Anna Bauer', 'anna@browns.at', 'Service', 'manager', '#f59e0b'),
  ('Max Huber', 'max@browns.at', 'Küche', 'employee', '#3b82f6'),
  ('Lena Müller', 'lena@browns.at', 'Bar', 'employee', '#10b981')
on conflict do nothing;
