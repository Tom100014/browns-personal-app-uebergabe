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

async function sendSupabaseInvite() {
  console.log(`Sending Supabase Auth invitation / reset link to ${email}...`)

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "https://browns-perso-app.vercel.app/willkommen",
  })

  if (error) {
    console.error("Supabase Auth reset email error:", error.message)
  } else {
    console.log("Supabase Auth email dispatched successfully!", data)
  }

  // Also generate magic link for instant test
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: email,
    options: {
      redirectTo: "https://browns-perso-app.vercel.app/willkommen",
    },
  })

  if (linkError) {
    console.error("Generate magic link error:", linkError.message)
  } else {
    console.log("\nDirect Magic Link generated for testing:")
    console.log(linkData.properties.action_link)
  }
}

sendSupabaseInvite().catch(console.error)
