import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase configuration in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Current week: Monday 2026-07-20 to Sunday 2026-07-26
const weekDays = [
  { date: "2026-07-20", dayName: "Montag", revenue: 2150 },
  { date: "2026-07-21", dayName: "Dienstag", revenue: 2480 },
  { date: "2026-07-22", dayName: "Mittwoch", revenue: 2890, event: "sick_call" },
  { date: "2026-07-23", dayName: "Donnerstag", revenue: 3120, event: "retroactive_clockin" },
  { date: "2026-07-24", dayName: "Freitag", revenue: 4100, event: "peak_evening" },
  { date: "2026-07-25", dayName: "Samstag", revenue: 5650, event: "weekend_rush" },
  { date: "2026-07-26", dayName: "Sonntag", revenue: 4950, event: "weekend_rush" },
]

async function runWeeklySimulation() {
  console.log("=== RUNNING FULL WEEKLY GASTRONOMY SCENARIO (20.07.2026 - 26.07.2026) ===\n")

  // 1. Fetch Employees
  const { data: employees, error: empErr } = await supabase.from("employees").select("*")
  if (empErr || !employees || employees.length === 0) {
    console.error("Failed to fetch employees:", empErr?.message)
    process.exit(1)
  }
  console.log(`1. Loaded ${employees.length} employees for Café scenario.`)

  // Divide employees into positions
  const baristas = employees.filter(e => e.position?.includes("Bar") || e.position?.includes("Theke"))
  const kitchen = employees.filter(e => e.position?.includes("Küche"))
  const service = employees.filter(e => e.position?.includes("Service"))
  const managers = employees.filter(e => e.role === "admin" || e.role === "manager")

  console.log(`   -> Bar/Theke: ${baristas.length}, Küche: ${kitchen.length}, Service: ${service.length}, Leitung: ${managers.length}`)

  // Clear existing entries for this test week to allow clean re-simulation
  await supabase.from("time_entries").delete().gte("date", "2026-07-20").lte("date", "2026-07-26")
  await supabase.from("shifts").delete().gte("date", "2026-07-20").lte("date", "2026-07-26")

  // 2. Generate Shifts & Time Entries for the whole week
  console.log("\n2. Generating weekly shift schedules & time entries...")
  let totalShifts = 0
  let totalEntries = 0

  for (const day of weekDays) {
    // Select daily staff
    const bStaff = baristas.slice(0, 3)
    const kStaff = kitchen.slice(0, 2)
    const sStaff = service.slice(0, day.event?.includes("weekend") ? 5 : 3)
    const mStaff = managers.slice(0, 1)

    const dailyStaff = [...bStaff, ...kStaff, ...sStaff, ...mStaff]

    for (const [idx, emp] of dailyStaff.entries()) {
      const isMorning = idx % 2 === 0
      const startTime = isMorning ? "08:00" : "12:00"
      const endTime = isMorning ? "16:00" : "20:00"
      const position = emp.position || "Service"

      // Special case: Wednesday sick call for Test Wachendorf
      if (day.date === "2026-07-22" && emp.email === "wachendorf23@gmail.com") {
        // Shift absent
        await supabase.from("shifts").insert({
          employee_id: emp.id,
          date: day.date,
          start_time: startTime,
          end_time: endTime,
          position: "Theke",
          status: "absent",
          note: "Akute Krankmeldung (Sommer-Grippe)",
          created_at: new Date().toISOString(),
        })

        // Absence record
        const { data: absence } = await supabase.from("absences").insert({
          employee_id: emp.id,
          type: "krank",
          start_date: day.date,
          end_date: day.date,
          note: "Krankmeldung Barista",
          status: "approved",
          created_at: new Date().toISOString(),
        }).select().single()

        // Coverage request & replacement by colleague Angelo
        const { data: covReq } = await supabase.from("coverage_requests").insert({
          original_employee_id: emp.id,
          date: day.date,
          start_time: startTime,
          end_time: endTime,
          position: "Theke",
          reason: "Krankmeldung Test Wachendorf",
          status: "filled",
          filled_by: baristas[0]?.id || emp.id,
          created_at: new Date().toISOString(),
        }).select().single()

        if (covReq && baristas[0]) {
          await supabase.from("messages").insert({
            employee_id: baristas[0].id,
            content: `✋ ${baristas[0].name} übernimmt die Schicht Theke für Test Wachendorf!`,
            type: "coverage_offer",
            meta: { request_id: covReq.id },
            created_at: new Date().toISOString(),
          })
        }

        totalShifts++
        continue
      }

      // Normal shift
      const { data: shift } = await supabase.from("shifts").insert({
        employee_id: emp.id,
        date: day.date,
        start_time: startTime,
        end_time: endTime,
        position,
        status: "confirmed",
        note: `Gastronomie Regulär (${day.dayName})`,
        created_at: new Date().toISOString(),
      }).select().single()

      if (shift) totalShifts++

      // Time entry (Clock-in / Clock-out)
      // Special case: Thursday retroactive entry for kitchen staff
      const clockIn = isMorning ? "07:58" : "12:02"
      const clockOut = isMorning ? "16:05" : "20:10"
      const breakMins = 30
      const hours = 7.6

      // Calculate realistic shift revenue for service & bar staff
      const isRevenueRole = position.includes("Service") || position.includes("Bar") || position.includes("Theke")
      const baseRev = day.revenue / dailyStaff.length
      const shiftRevenue = isRevenueRole ? Math.round((baseRev + (idx * 35) + (day.date === "2026-07-25" ? 180 : 0)) * 100) / 100 : 0

      const { data: entry, error: entryErr } = await supabase.from("time_entries").insert({
        employee_id: emp.id,
        date: day.date,
        clock_in: clockIn,
        clock_out: clockOut,
        break_minutes: breakMins,
        total_hours: hours,
        auto_closed: false,
        created_at: new Date().toISOString(),
      }).select().single()

      if (entryErr) {
        console.error(`Error inserting entry for ${emp.name} on ${day.date}:`, entryErr.message)
      } else {
        totalEntries++
      }
    }

    // Insert daily revenue
    await supabase.from("daily_revenues").upsert({
      date: day.date,
      revenue_net: day.revenue,
      note: `Wochenlauf Café - ${day.dayName} ${day.event ? `(${day.event})` : ""}`,
      created_at: new Date().toISOString(),
    }, { onConflict: "date" })
  }

  console.log(`   -> Successfully created ${totalShifts} shifts and ${totalEntries} time entries for the week.`)

  // 3. Write Knowledge & Audit Log for weekly evaluation
  console.log("\n3. Writing Café Intelligence & Audit notes...")
  await supabase.from("knowledge_docs").insert({
    title: "Wochenanalyse Café Browns Nürnberg (20.-26. Juli 2026)",
    note: "SIGNAL: positiv | META: tags=Wochenlauf,Auslastung,Vertretung | BODY: Erfolgreicher Wochenablauf im Café. Der spontane Krankheitsausfall am Mittwoch wurde durch Angelo sofort kompensiert. Am Samstag wurde ein neuer Umsatz-Rekord erzielt.",
    kind: "manual_note",
    extracted: "Super Teamfit in der Barista-Besetzung. Keine unentschuldigten Fehlzeiten.",
    created_at: new Date().toISOString(),
  })

  await supabase.from("audit_logs").insert({
    action: "Vollständige Wochenlauf-Simulation",
    details: {
      week: "2026-W30",
      totalShifts,
      totalEntries,
      revenueTotal: weekDays.reduce((s, d) => s + d.revenue, 0),
    },
    created_at: new Date().toISOString(),
  })

  console.log("\n=== WEEKLY SCENARIO SIMULATION COMPLETED SUCCESSFULLY! ===")
}

runWeeklySimulation().catch(err => {
  console.error("Error in weekly simulation:", err)
  process.exit(1)
})
