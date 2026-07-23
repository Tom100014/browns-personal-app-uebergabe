import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const resendKey = process.env.RESEND_API_KEY
const resendFrom = process.env.RESEND_FROM || "Browns Perso <onboarding@resend.dev>"

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase configuration in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const email = "wachendorf23@gmail.com"
const name = "Test Wachendorf"
const phone = "017634177214"
const appUrl = "https://browns-perso-app.vercel.app/login"

async function sendInviteToWachendorf() {
  console.log(`=== SENDING ACCESS INVITATION TO ${email} ===\n`)

  // 1. Check or Insert Employee
  let { data: employee, error: findErr } = await supabase
    .from("employees")
    .select("*")
    .or(`email.eq.${email},email.eq.wachendorf@gmail.de`)
    .maybeSingle()

  if (findErr) {
    console.error("Find error:", findErr.message)
  }

  if (!employee) {
    const { data: created, error: insertErr } = await supabase
      .from("employees")
      .insert({
        name,
        email,
        phone,
        role: "employee",
        position: "Theke / Bar",
        color: "#3b82f6",
        employment_type: "Vollzeit",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertErr) {
      console.error("Failed to insert employee:", insertErr.message)
      process.exit(1)
    }
    employee = created
    console.log("  -> Employee created:", employee.id)
  } else {
    // Update email and phone
    const { data: updated, error: updateErr } = await supabase
      .from("employees")
      .update({ name, email, phone })
      .eq("id", employee.id)
      .select()
      .single()

    if (updateErr) {
      console.error("Failed to update employee:", updateErr.message)
    } else {
      employee = updated
      console.log("  -> Employee updated to email:", email)
    }
  }

  // 2. Create / Invite Supabase Auth User
  console.log("\n2. Inviting user via Supabase Auth...")
  const { data: authUser, error: authErr } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: "https://browns-perso-app.vercel.app/willkommen",
  })

  if (authErr) {
    console.log("  -> Auth invite notice (user may already exist):", authErr.message)
  } else if (authUser?.user) {
    console.log("  -> Supabase Auth User created/invited:", authUser.user.id)
    await supabase.from("employees").update({ auth_user_id: authUser.user.id }).eq("id", employee.id)
  }

  // 3. Send direct welcome/access email via Resend
  console.log("\n3. Sending Welcome Email via Resend...")
  const inviteText = `Hallo ${name},

herzlich willkommen im Team der Browns Lounge Nürnberg! Hier ist dein offizieller Zugang zur Browns Personal App:

Link zur App:
${appUrl}

Dein Anmelde-Login: ${email}
Telefonnummer: ${phone}

Anleitung & Erste Schritte:
1. Öffne den Link oben im Browser deines Smartphones.
2. Auf dem iPhone (Safari): Klicke unten auf das Teilen-Symbol -> "Zum Home-Bildschirm".
3. Auf Android (Chrome): Klicke oben rechts auf die drei Punkte -> "App installieren" / "Zum Startbildschirm hinzufügen".
4. Erlaube nach dem ersten Login die Push-Benachrichtigungen, damit du sofort über Schicht-Änderungen, Vertretungsanfragen und Nachrichten informiert wirst.
5. Passwort verwalten: Du kannst dir beim ersten Login ein neues Passwort vergeben oder über "Passwort vergessen?" jederzeit zurücksetzen.

Bei Fragen oder Unterstützung wende dich direkt an die Leitung.

Viele Grüße,
Dein Browns Lounge Team`

  if (!resendKey) {
    console.warn("RESEND_API_KEY missing, showing message content instead:\n")
    console.log("-----------------------------------------")
    console.log(inviteText)
    console.log("-----------------------------------------")
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: resendFrom,
          to: [email],
          subject: "Willkommen bei Browns Personal App — Dein Zugang",
          text: inviteText,
          html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937;background:#fff;border:1px solid #e5e7eb;border-radius:16px">
            <h1 style="color:#7c2d12;font-size:20px;margin-bottom:16px">BROWN'S LOUNGE NÜRNBERG</h1>
            <h2 style="font-size:16px;color:#111827">Willkommen im Team, ${name}!</h2>
            <p style="font-size:14px;line-height:1.6;color:#374151">Hier ist dein persönlicher Zugang zur Browns Mitarbeiter-App:</p>
            
            <div style="background:#fff7ed;border:1px solid #ffedd5;padding:16px;border-radius:12px;margin:16px 0">
              <p style="margin:4px 0;font-size:14px"><strong>Login E-Mail:</strong> ${email}</p>
              <p style="margin:4px 0;font-size:14px"><strong>Telefon:</strong> ${phone}</p>
            </div>

            <a href="${appUrl}" style="display:inline-block;background:#9a3412;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:12px;margin:12px 0">Browns Perso App öffnen</a>

            <h3 style="font-size:14px;margin-top:20px;color:#111827">Anleitung & Erste Schritte:</h3>
            <ol style="font-size:13px;line-height:1.6;color:#4b5563;padding-left:20px">
              <li>Öffne den Link oben im Browser deines Smartphones.</li>
              <li><strong>iPhone (Safari):</strong> Klicke unten auf das Teilen-Symbol &rarr; <em>"Zum Home-Bildschirm"</em>.</li>
              <li><strong>Android (Chrome):</strong> Klicke oben rechts auf die drei Punkte &rarr; <em>"Zum Startbildschirm hinzufügen"</em>.</li>
              <li>Erlaube nach dem Login Push-Benachrichtigungen für Schichterinnerungen & Chat.</li>
            </ol>
            <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0" />
            <p style="font-size:12px;color:#9ca3af">Browns Lounge Nürnberg Personalapp &bull; Automatische Einladung</p>
          </div>`,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        console.error("Resend API returned error:", res.status, data)
      } else {
        console.log("  -> Access email successfully sent via Resend to wachendorf23@gmail.com! Resend ID:", data.id)
      }
    } catch (err) {
      console.error("Error calling Resend API:", err)
    }
  }

  console.log("\n=== INVITATION PROCESS COMPLETED ===")
}

sendInviteToWachendorf().catch(err => {
  console.error("Error sending invite:", err)
  process.exit(1)
})
