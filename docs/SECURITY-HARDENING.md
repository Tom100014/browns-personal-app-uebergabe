# Security and Privacy Production Hardening

## Authoritative Controls

The source of truth for database authorization is:

`supabase/migrations/20260718120000_security_privacy_hardening.sql`

It default-denies anonymous access on the explicitly audited Browns tables, enables and forces RLS for that reviewed table set, installs least-privilege employee and manager policies, protects owner identity fields, uses the database clock for employee time-entry mutations, limits storage buckets, and provides a service-role-only distributed rate limiter. New tables must be added to the audited list before release.

Application controls include exact-origin mutation checks, deployment-trusted client IP extraction, owner access takeover protection, restricted manager broadcasts, same-origin push navigation, server-side file size/type/signature validation, AI disabled by default, filtered and trust-labelled RAG context, explicit approval before AI writes, bounded learning retention, and a sandboxed contract preview with escaped content. Generated contract HTML remains private, contains its own restrictive CSP, and is the only HTML accepted by the documents bucket; general document uploads still reject HTML.

## Audit Plan

1. Before every release, run the security route tests and `npm run build`.
2. Apply pending Supabase migrations before deploying application code. The production rate limiter fails closed until its RPC exists.
3. In Supabase SQL Editor, verify no `anon` table privileges and no permissive policies:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
order by table_schema, table_name, privilege_type;
```

4. Verify all three buckets are private and have the migration's size/MIME limits.
5. Test as owner, manager, and employee: employee reads are self-only for private personnel, absence, document, and time data; manager writes work; owner role/email/auth linkage cannot be changed; employee clock values come from the server.
6. Review `audit_log` weekly for access changes, broadcasts, uploads, approvals, and unusual rate-limit failures. Export it monthly to restricted retention storage and investigate gaps before release approval.

## Deployment Gate

Do not deploy the application changes before `supabase db push` succeeds. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code. Keep `NEXT_PUBLIC_APP_URL` set to the canonical HTTPS origin and set `TRUSTED_PROXY_IP_HEADERS` only when the hosting proxy contract guarantees those headers are overwritten.

Sick-note, personnel-document, knowledge, and archived schedule uploads all use the validated server upload endpoint. Employee coverage requests are also resolved server-side so private shift and absence rows do not need broad client read access.

## Fresh Environment Note

`supabase-schema.sql` is only a minimal historical example and is not a complete production bootstrap. The hardening migration intentionally aborts when the established Browns production tables or `employees.auth_user_id` are missing. A fresh Supabase project therefore needs a full schema export or complete baseline migrations before this hardening migration is applied.
