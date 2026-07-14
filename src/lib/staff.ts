import { createClient } from "@/lib/supabase-server"
import type { Employee } from "@/types"

const OWNER_EMAIL = "admin@browns.at"

export type CurrentStaff = {
  userId: string
  email: string | null
  employee: Employee | null
  isManager: boolean
}

/**
 * Resolve the logged-in user to their employee record and role.
 * The owner account (admin@browns.at) is always treated as management,
 * even without a matching employees row.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  const emp = (employee ?? null) as Employee | null
  const isManager = user.email === OWNER_EMAIL || emp?.role === "admin" || emp?.role === "manager"

  return { userId: user.id, email: user.email ?? null, employee: emp, isManager }
}
