// Optionaler WhatsApp-Kanal über die WhatsApp Business Cloud API (Meta).
// No-Op, bis WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID gesetzt sind UND der
// Kanal in den Einstellungen aktiviert wurde. Push bleibt der Hauptkanal.

const GRAPH_VERSION = "v21.0"

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
}

// Bringt eine Telefonnummer grob ins internationale Format (nur Ziffern, ohne +).
// Standard-Land: Deutschland (49). Bereits internationale Nummern bleiben erhalten.
export function normalizePhone(raw: string): string | null {
  if (!raw) return null
  let p = raw.replace(/[^\d+]/g, "")
  if (p.startsWith("+")) p = p.slice(1)
  else if (p.startsWith("00")) p = p.slice(2)
  else if (p.startsWith("0")) p = "49" + p.slice(1)
  return p.length >= 8 ? p : null
}

export async function sendWhatsApp(phones: string[], title: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId || phones.length === 0) return

  const text = `*${title}*\n${body}`
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`

  await Promise.all(phones.map(async (to) => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      })
    } catch { /* best effort — Push/E-Mail bleiben Hauptkanäle */ }
  }))
}
