-- Daily Revenue Table for Browns Perso
create table if not exists daily_revenue (
  date date primary key,
  amount numeric(10,2) not null default 0,
  notes text,
  updated_at timestamptz default now()
);

-- Row Level Security
alter table daily_revenue enable row level security;
alter table daily_revenue force row level security;

-- Policies for managers/admins
create policy "Management full access to daily_revenue" on daily_revenue
  for all to authenticated
  using (
    exists (
      select 1 from employees
      where employees.auth_user_id = auth.uid()
      and employees.role in ('admin', 'manager')
    )
    or auth.email() = 'admin@browns.at'
  );
