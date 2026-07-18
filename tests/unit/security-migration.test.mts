import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(new URL("../../supabase/migrations/20260718120000_security_privacy_hardening.sql", import.meta.url), "utf8")
const atomicImportSql = readFileSync(new URL("../../supabase/migrations/20260718130000_atomic_shift_import.sql", import.meta.url), "utf8")

test("security migration protects privileged employee identities", () => {
  assert.match(sql, /before insert or update or delete on public\.employees/i)
  assert.match(sql, /new\.role='admin' or new\.auth_user_id is not null/i)
  assert.match(sql, /new\.auth_user_id is distinct from old\.auth_user_id/i)
  assert.match(sql, /protected owner cannot be deleted/i)
  assert.match(sql, /admin role deletion requires admin approval/i)
})

test("management can create employee absences", () => {
  assert.match(sql, /absences_insert_manager_or_self[\s\S]*app_is_manager\(\)/i)
})

test("storage limits match the server upload boundary", () => {
  assert.match(sql, /file_size_limit=4194304[\s\S]*image\/heic[\s\S]*where id='documents'/i)
})

test("employee chat pushes use server time and one-time dispatch claims", () => {
  assert.match(sql, /notification_dispatches[\s\S]*dedupe_key text primary key/i)
  assert.match(sql, /server_message_created_at_trigger before insert on public\.messages/i)
})

test("employee directory exposes only operational team fields", () => {
  const view = sql.match(/create or replace view public\.employee_directory[\s\S]*?from public\.employees;/i)?.[0] ?? ""
  assert.match(view, /select id,name,role,position,color,avatar/i)
  assert.doesNotMatch(view, /email|phone|auth_user_id|personnel_number/i)
})

test("time-entry hardening covers duplicate and overnight clocks", () => {
  assert.match(sql, /time_entries_one_open_per_employee[\s\S]*where clock_out is null/i)
  assert.match(sql, /now_local - \(old\.date \+ old\.clock_in\)/i)
})

test("migration scopes destructive policy replacement to audited tables", () => {
  assert.doesNotMatch(sql, /from pg_tables where schemaname = 'public'/i)
  assert.match(sql, /unreviewed storage bucket exists/i)
  assert.match(sql, /lock_timeout = '5s'/i)
})

test("schedule imports are atomic, idempotent and service-role only", () => {
  assert.match(atomicImportSql, /shift_import_runs[\s\S]*id uuid primary key/i)
  assert.match(atomicImportSql, /shifts_exact_assignment_unique/i)
  assert.match(atomicImportSql, /on conflict do nothing/i)
  assert.match(atomicImportSql, /insert into public\.audit_log/i)
  assert.match(atomicImportSql, /revoke all on function[\s\S]*anon, authenticated/i)
  assert.match(atomicImportSql, /grant execute on function[\s\S]*service_role/i)
})
