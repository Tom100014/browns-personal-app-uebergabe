import { sendEmail } from "../src/lib/email.ts"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

async function testResend() {
  console.log("Testing Resend email sending...")
  const res = await sendEmail(
    ["wachendorf23@gmail.com"],
    "Test E-Mail Browns Perso",
    "Dies ist ein Test der E-Mail-Funktion."
  )
  console.log("Result:", res)
}

testResend().catch(console.error)
