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

const todayStr = new Date().toISOString().slice(0, 10)
const targetEmail = "wachendorf23@gmail.com"

async function runDemo() {
  console.log(`=== RUNNING DEMO SIMULATION FOR ${todayStr} (${targetEmail}) ===\n`)

  // 1. Check or Insert Employee "Test Wachendorf"
  console.log(`1. Setting up Employee: Test Wachendorf (${targetEmail})...`)
  let { data: testEmp } = await supabase
    .from("employees")
    .select("*")
    .eq("email", targetEmail)
    .maybeSingle()

  if (!testEmp) {
    const { data: created, error: insertErr } = await supabase
      .from("employees")
      .insert({
        name: "Test Wachendorf",
        email: targetEmail,
        phone: "017634177214",
        role: "employee",
        position: "Theke / Bar",
        color: "#3b82f6",
        employment_type: "Vollzeit",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertErr) {
      console.error("Failed to create Test Wachendorf:", insertErr.message)
    } else {
      testEmp = created
    }
  } else {
    const { data: updated } = await supabase
      .from("employees")
      .update({
        name: "Test Wachendorf",
        phone: "017634177214",
        position: "Theke / Bar",
      })
      .eq("id", testEmp.id)
      .select()
      .single()
    testEmp = updated || testEmp
  }

  console.log("  -> Employee active ID:", testEmp.id)

  // Fetch all employees for team interaction
  const { data: allEmployees } = await supabase.from("employees").select("*")
  const otherEmp = allEmployees?.find(e => e.id !== testEmp.id) || testEmp

  // 2. Create Shift for Today for Test Wachendorf
  console.log("\n2. Creating today's shifts...")
  const { data: shift } = await supabase
    .from("shifts")
    .insert({
      employee_id: testEmp.id,
      date: todayStr,
      start_time: "09:00",
      end_time: "17:00",
      position: "Theke",
      status: "scheduled",
      note: "Frühschicht Theke",
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  // 3. Simulate Sickness / Absence for Today
  console.log("\n3. Simulating Krankmeldung / Ausfall for Test Wachendorf...")
  const { data: absence } = await supabase
    .from("absences")
    .insert({
      employee_id: testEmp.id,
      type: "krank",
      start_date: todayStr,
      end_date: todayStr,
      note: "Krankmeldung akut am Morgen (Fieber / Erkaeltung)",
      status: "approved",
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (shift) {
    await supabase.from("shifts").update({ status: "absent" }).eq("id", shift.id)
  }

  // 4. Create Coverage Request ("Ersatz gesucht")
  console.log("\n4. Creating Coverage Request ('Ersatz gesucht')...")
  const { data: coverageReq } = await supabase
    .from("coverage_requests")
    .insert({
      shift_id: shift?.id ?? null,
      absence_id: absence?.id ?? null,
      original_employee_id: testEmp.id,
      date: todayStr,
      start_time: "09:00",
      end_time: "17:00",
      position: "Theke",
      reason: "Krankmeldung Test Wachendorf",
      status: "open",
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (coverageReq) {
    // 5. Post Coverage Request Card into TeamChat
    console.log("\n5. Posting 'Ersatz gesucht' Card & Team Messages to TeamChat...")
    await supabase.from("messages").insert({
      employee_id: testEmp.id,
      content: `🚨 **Ersatz gesucht!** Schicht am ${todayStr} (09:00 - 17:00 Uhr, Theke). Grund: Krankmeldung Test Wachendorf.`,
      type: "coverage_request",
      meta: { request_id: coverageReq.id },
      created_at: new Date().toISOString(),
    })

    if (otherEmp && otherEmp.id !== testEmp.id) {
      await supabase.from("coverage_offers").insert({
        request_id: coverageReq.id,
        employee_id: otherEmp.id,
        created_at: new Date().toISOString(),
      })

      await supabase.from("messages").insert({
        employee_id: otherEmp.id,
        content: `✋ ${otherEmp.name} kann die Theken-Schicht heute übernehmen!`,
        type: "coverage_offer",
        meta: { request_id: coverageReq.id },
        created_at: new Date().toISOString(),
      })
    }
  }

  // 6. Simulate Time Entry for active colleague
  if (otherEmp) {
    await supabase.from("time_entries").insert({
      employee_id: otherEmp.id,
      date: todayStr,
      clock_in: "08:55",
      clock_out: "17:05",
      break_minutes: 30,
      total_hours: 7.67,
      auto_closed: false,
      created_at: new Date().toISOString(),
    })
  }

  console.log("\n=== DEMO DATA SIMULATION RE-RUN COMPLETE ===")
}

runDemo().catch(console.error)
