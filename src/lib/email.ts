// Optional email notifications via Resend. No-ops gracefully until RESEND_API_KEY
// (and a verified sender RESEND_FROM) are configured in the environment.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
}

function htmlBody(subject: string, text: string, link: string): string {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
    <p style="font-weight:700;font-size:18px;letter-spacing:.04em;color:#7c2d12;margin:0 0 16px">BROWN'S</p>
    <h1 style="font-size:16px;margin:0 0 8px;color:#111827">${subject}</h1>
    <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;margin:0 0 20px">${safe}</p>
    <a href="${link}" style="display:inline-block;background:#9a3412;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px">In Browns Perso öffnen</a>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0">Automatische Nachricht von Browns Perso.</p>
  </div>`
}

export async function sendEmail(to: string[], subject: string, text: string, url?: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM // e.g. "Browns Perso <no-reply@browns.at>"
  if (!key || !from || to.length === 0) return
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
  const link = url ? new URL(url, base).toString() : base
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, html: htmlBody(subject, text, link) }),
    })
  } catch { /* best effort — push remains the primary channel */ }
}
