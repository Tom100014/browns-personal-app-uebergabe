import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase configuration")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const email = "wachendorf23@gmail.com"
const defaultPassword = "Browns2026!"

async function activateAccount() {
  console.log(`=== ACTIVATING TEST ACCOUNT FOR ${email} ===\n`)

  // 1. Get or create employee record
  let { data: emp } = await supabase.from("employees").select("*").eq("email", email).maybeSingle()

  if (!emp) {
    const { data: created } = await supabase.from("employees").insert({
      name: "Test Wachendorf",
      email,
      phone: "017634177214",
      role: "employee",
      position: "Theke / Bar",
      color: "#3b82f6",
      created_at: new Date().toISOString(),
    }).select().single()
    emp = created
  }

  // 2. Ensure Supabase Auth User with Password
  let authUserId = emp?.auth_user_id

  const { data: usersData } = await supabase.auth.admin.listUsers()
  let authUser = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

  if (!authUser) {
    console.log("Creating new Auth User with password...")
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true,
    })
    if (createErr) console.error("Create User Error:", createErr.message)
    authUser = newUser?.user
  } else {
    console.log("Updating password for existing Auth User...")
    const { data: updatedUser, error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: defaultPassword,
      email_confirm: true,
    })
    if (updateErr) console.error("Update User Password Error:", updateErr.message)
    authUser = updatedUser?.user || authUser
  }

  if (authUser && emp) {
    await supabase.from("employees").update({ auth_user_id: authUser.id }).eq("id", emp.id)
  }

  // 3. Generate instant magic link for 1-click access
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: email,
    options: {
      redirectTo: "https://browns-perso-app.vercel.app/portal",
    },
  })

  console.log("\n=== TEST ACCOUNT ACTIVATED SUCCESSFULLY ===")
  console.log("E-Mail (Login):", email)
  console.log("Passwort:", defaultPassword)
  console.log("App Login URL: https://browns-perso-app.vercel.app/login")
  console.log("Direkter 1-Klick Login Link:\n", linkData?.properties?.action_link)
}

activateAccount().catch(console.error)
