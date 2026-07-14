# Datenbank-Schema (Supabase / PostgreSQL)

Projekt-Ref: `nrqbjzralbteecdmrxeq` · Schema `public` · 18 Tabellen.
RLS aktiv; sensible Tabellen (employee_private, documents, revenue, extras, knowledge_docs, audit_log) nur für Leitung. Schreibrechte auf settings/absences/shifts/time_entries sind rollenbasiert eingeschränkt.

## absences

- id uuid
- employee_id uuid
- type text
- start_date date
- end_date date
- note text
- status text
- created_at timestamp with time zone
- attachment_path text

## audit_log

- id uuid
- actor text
- action text
- detail text
- created_at timestamp with time zone

## checklist_items

- id uuid
- checklist_id uuid
- label text
- done boolean
- done_by uuid
- done_at timestamp with time zone

## checklists

- id uuid
- title text
- shift_id uuid
- created_at timestamp with time zone

## coverage_offers

- id uuid
- request_id uuid
- employee_id uuid
- created_at timestamp with time zone

## coverage_requests

- id uuid
- shift_id uuid
- absence_id uuid
- original_employee_id uuid
- date date
- start_time time without time zone
- end_time time without time zone
- position text
- reason text
- status text
- suggested_employee_id uuid
- filled_by uuid
- approved_by uuid
- created_at timestamp with time zone

## documents

- id uuid
- employee_id uuid
- name text
- category text
- file_path text
- size_bytes bigint
- uploaded_at timestamp with time zone

## employee_private

- employee_id uuid
- hourly_wage numeric
- weekly_hours numeric
- address text
- birth_date date
- notes text
- vacation_days_per_year integer

## employees

- id uuid
- name text
- email text
- phone text
- role text
- position text
- color text
- avatar text
- created_at timestamp with time zone
- employment_type text
- start_date date
- auth_user_id uuid
- personnel_number text
- notifications_enabled boolean

## events

- id uuid
- date date
- end_date date
- title text
- type text
- impact integer
- note text
- created_at timestamp with time zone
- source text

## extras

- id uuid
- employee_id uuid
- month text
- type text
- label text
- amount numeric
- created_at timestamp with time zone

## knowledge_docs

- id uuid
- title text
- note text
- file_path text
- kind text
- created_at timestamp with time zone
- extracted text

## messages

- id uuid
- employee_id uuid
- content text
- created_at timestamp with time zone
- type text
- meta jsonb

## push_subscriptions

- id uuid
- employee_id uuid
- endpoint text
- p256dh text
- auth text
- user_agent text
- created_at timestamp with time zone

## revenue

- month text
- amount numeric
- updated_at timestamp with time zone

## settings

- key text
- value text

## shifts

- id uuid
- employee_id uuid
- date date
- start_time time without time zone
- end_time time without time zone
- position text
- note text
- status text
- created_at timestamp with time zone

## time_entries

- id uuid
- employee_id uuid
- date date
- clock_in time without time zone
- clock_out time without time zone
- break_minutes integer
- total_hours numeric
- created_at timestamp with time zone
- auto_closed boolean

