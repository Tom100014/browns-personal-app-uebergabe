import type { SupabaseClient, User } from "@supabase/supabase-js"
import { findDifferentEmployeeIdentity, normalizeEmail } from "@/lib/security-core"

type EmployeeIdentity = { id: string; email: string | null; auth_user_id: string | null }

export async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error("Auth users could not be checked")
    const user = data.users.find(candidate => normalizeEmail(candidate.email) === email)
    if (user) return user
    if (data.users.length < 200) return null
  }
  throw new Error("Auth user lookup exceeded its safe page limit")
}

export async function findEmployeeIdentityConflict(
  admin: SupabaseClient,
  targetEmployeeId: string,
  email: string,
  authUserId?: string | null,
): Promise<EmployeeIdentity | null> {
  const byEmailQuery = admin.from("employees").select("id,email,auth_user_id").ilike("email", email)
  const [byEmail, byAuth] = await Promise.all([
    byEmailQuery,
    authUserId
      ? admin.from("employees").select("id,email,auth_user_id").eq("auth_user_id", authUserId)
      : Promise.resolve({ data: [] as EmployeeIdentity[], error: null }),
  ])

  if (byEmail.error || byAuth.error) throw new Error("Employee identity could not be checked")
  const rows = [...(byEmail.data ?? []), ...(byAuth.data ?? [])] as EmployeeIdentity[]
  return findDifferentEmployeeIdentity(rows, targetEmployeeId)
}
