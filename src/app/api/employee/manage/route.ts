import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { jsonNoStore, rejectCrossOriginMutation } from "@/lib/security"

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase admin keys")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  const csrfError = rejectCrossOriginMutation(request)
  if (csrfError) return csrfError

  try {
    const body = await request.json()
    const { action, id, name, email, phone, position, role, employment_type, hourly_wage, weekly_hours, vacation_days_per_year, start_date, birth_date, address, notes, avatar, color } = body
    const supabase = getAdminClient()

    // 1. DELETE EMPLOYEE
    if (action === "delete") {
      if (!id) return jsonNoStore({ error: "Mitarbeiter-ID fehlt" }, { status: 400 })

      // Check if primary admin
      const { data: emp } = await supabase.from("employees").select("email, role").eq("id", id).single()
      if (emp?.email?.toLowerCase().includes("zeynep")) {
        return jsonNoStore({ error: "Die Hauptberechtigte kann nicht gelöscht werden." }, { status: 400 })
      }

      // Safe cleanup of related records before deletion
      await supabase.from("shifts").update({ employee_id: null }).eq("employee_id", id)
      await supabase.from("time_entries").delete().eq("employee_id", id)
      await supabase.from("absences").delete().eq("employee_id", id)
      await supabase.from("coverage_requests").delete().eq("employee_id", id)
      await supabase.from("coverage_offers").delete().eq("employee_id", id)
      await supabase.from("messages").delete().eq("employee_id", id)
      await supabase.from("employee_private").delete().eq("employee_id", id)

      // Delete employee record
      const { error: delErr } = await supabase.from("employees").delete().eq("id", id)
      if (delErr) {
        return jsonNoStore({ error: "Fehler beim Löschen: " + delErr.message }, { status: 500 })
      }

      return jsonNoStore({ success: true, message: "Mitarbeiter erfolgreich gelöscht." })
    }

    // 2. AVATAR UPDATE / DELETE
    if (action === "avatar") {
      if (!id) return jsonNoStore({ error: "Mitarbeiter-ID fehlt" }, { status: 400 })
      const { error: avatarErr } = await supabase
        .from("employees")
        .update({ avatar: avatar || null })
        .eq("id", id)

      if (avatarErr) {
        return jsonNoStore({ error: "Fehler beim Profilbild-Speichern: " + avatarErr.message }, { status: 500 })
      }

      return jsonNoStore({ success: true, avatar: avatar || null })
    }

    // 3. CREATE EMPLOYEE
    if (action === "create") {
      if (!name || !email) return jsonNoStore({ error: "Name und E-Mail sind Pflichtfelder." }, { status: 400 })

      const empPayload = {
        name,
        email,
        phone: phone || null,
        position: position || "Service",
        role: role || "employee",
        employment_type: employment_type || null,
        color: color || "#3b82f6",
        avatar: avatar || null,
        start_date: start_date || null,
        created_at: new Date().toISOString(),
      }

      const { data: created, error: createErr } = await supabase
        .from("employees")
        .insert(empPayload)
        .select()
        .single()

      if (createErr || !created) {
        return jsonNoStore({ error: "Fehler beim Erstellen: " + (createErr?.message || "Unbekannt") }, { status: 500 })
      }

      // Upsert private management fields
      const wageNum = hourly_wage ? Number(String(hourly_wage).replace(",", ".")) : null
      const hoursNum = weekly_hours ? Number(String(weekly_hours).replace(",", ".")) : null
      const vacNum = vacation_days_per_year ? Math.round(Number(vacation_days_per_year)) : null

      await supabase.from("employee_private").upsert({
        employee_id: created.id,
        hourly_wage: wageNum,
        weekly_hours: hoursNum,
        vacation_days_per_year: vacNum,
        birth_date: birth_date || null,
        address: address || null,
        notes: notes || null,
      })

      return jsonNoStore({ success: true, employee: { ...created, hourly_wage: wageNum } })
    }

    // 4. UPDATE EMPLOYEE
    if (action === "update") {
      if (!id) return jsonNoStore({ error: "Mitarbeiter-ID fehlt" }, { status: 400 })

      const empPayload = {
        name,
        email,
        phone: phone || null,
        position: position || "Service",
        role: role || "employee",
        employment_type: employment_type || null,
        ...(color ? { color } : {}),
        ...(avatar !== undefined ? { avatar } : {}),
        start_date: start_date || null,
      }

      const { data: updated, error: updateErr } = await supabase
        .from("employees")
        .update(empPayload)
        .eq("id", id)
        .select()
        .single()

      if (updateErr) {
        return jsonNoStore({ error: "Fehler beim Speichern: " + updateErr.message }, { status: 500 })
      }

      const wageNum = hourly_wage ? Number(String(hourly_wage).replace(",", ".")) : null
      const hoursNum = weekly_hours ? Number(String(weekly_hours).replace(",", ".")) : null
      const vacNum = vacation_days_per_year ? Math.round(Number(vacation_days_per_year)) : null

      await supabase.from("employee_private").upsert({
        employee_id: id,
        hourly_wage: wageNum,
        weekly_hours: hoursNum,
        vacation_days_per_year: vacNum,
        birth_date: birth_date || null,
        address: address || null,
        notes: notes || null,
      })

      return jsonNoStore({ success: true, employee: { ...(updated || {}), hourly_wage: wageNum } })
    }

    return jsonNoStore({ error: "Ungültige Aktion" }, { status: 400 })
  } catch (cause) {
    return jsonNoStore({ error: "Serverfehler: " + (cause instanceof Error ? cause.message : "Unbekannt") }, { status: 500 })
  }
}
